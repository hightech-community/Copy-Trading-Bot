import chalk from 'chalk';
import dotenv from 'dotenv';
import BigNumber from 'bignumber.js';
import { Metaplex } from '@metaplex-foundation/js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey, Connection, ParsedTransactionWithMeta, PartiallyDecodedInstruction, ParsedInstruction, ParsedAccountData, LAMPORTS_PER_SOL } from '@solana/web3.js';

dotenv.config({
  path: './.env',
});

import { getQuoteForSwap, jupiterSwap } from './jupiter';
import { TokenListType, AnalyzeType, TokenInforType } from './types';
import { expectAmountOut, getInforFromRaydiumPool, getReserves, raydiumSwap } from './raydium';
import { handleError, logBuyOrSellTrigeer, logCircular, logLine, logSkipped, logToFile, logger, sleep } from './utils';
import {
  JUPITER_AGGREGATOR_V6,
  LIMIT_ORDER,
  RAYDIUM_AUTHORITY_V4,
  RAYDIUM_LIQUIDITYPOOL_V4,
  SLIPPAGE,
  SOL_ADDRESS,
  TARGET_WALLET_ADDRESS,
  TARGET_WALLET_MIN_TRADE,
  TRADE_AMOUNT,
  WALLET,
  buyTokenList,
  connection1,
  processedTransactionSignatures,
  processedTransactionSignaturesLimitCount,
} from './config';
import bot from './bot';

async function monitorNewToken() {
  console.info(chalk.bgWhite.black('       🛠  BOT INITIALIZED       '));
  console.log('🔍 Monitoring Target Wallet:', chalk.magenta(TARGET_WALLET_ADDRESS.toString()));
  console.info(`🔷 Min Trade Size: ${chalk.yellow(TARGET_WALLET_MIN_TRADE / LAMPORTS_PER_SOL)} SOL | Trading Amount:`, TRADE_AMOUNT / LAMPORTS_PER_SOL, 'SOL');
  console.log(chalk.gray('-------------------------------------------------------------------------'));
  // let pool = false;

  try {
    await connection1.onLogs(
      TARGET_WALLET_ADDRESS,
      async ({ logs, err, signature }) => {
        if (err) {
          return;
        }

        // if (pool === true) {
        //   return;
        // }

        // SmartFox Identify the dex
        const dex = identifyDex(logs);
        if (!dex) {
          return;
        }
        // pool = true;

        // SmartFox Skip the already processed transaction
        if (processedTransactionSignatures.includes(signature)) {
          return;
        }

        // OB Get the transaction from signature
        const transaction = await connection1.getParsedTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });

        // If no transaction
        if (!transaction) {
          return;
        }

        await processTransaction(transaction, signature, dex);

        processedTransactionSignatures.push(signature);
        // OB Remove the first item if the array exceed the limitation of length
        if (processedTransactionSignatures.length > processedTransactionSignaturesLimitCount) {
          processedTransactionSignatures.shift();
        }
      },
      'confirmed'
    );
  } catch (error: any) {
    handleError(error.message || 'Unexpected error while monitoring target wallet.');
  }
}

function identifyDex(logs: string[]) {
  try {
    if (!logs.length) return null;
    if (logs.some((log) => log.includes(JUPITER_AGGREGATOR_V6.toString()))) {
      return 'Jupiter';
    }
    if (logs.some((log) => log.includes(RAYDIUM_LIQUIDITYPOOL_V4.toString()))) {
      return 'Raydium';
    }
    return null;
  } catch (error) {
    return null;
  }
}

/*
 * Process specific transaction
 */
async function processTransaction(transaction: ParsedTransactionWithMeta, signature: string, dex: string) {
  try {
    // SmartFox Analyze transaction, get poolAccount, solAccount and tokenAccount account
    const analyze = await analyzeTransaction(transaction, signature, dex);

    logToFile(
      analyze.type,
      TARGET_WALLET_ADDRESS.toString(),
      analyze.dex,
      analyze.type === 'Buy' ? analyze.to.token_address : analyze.type === 'Sell' ? analyze.from.token_address : analyze.from.token_address + analyze.to.token_address,
      analyze.type === 'Buy' ? analyze.from.amount.toString() : analyze.type === 'Sell' ? analyze.to.amount.toString() : '',
      'Monitored new transaction'
    );
    logger(analyze);
    let solDiff = 0;
    if (analyze.type === 'Buy') solDiff = analyze.from.amount;
    if (analyze.type === 'Sell') solDiff = analyze.to.amount;

    // Skip trades below the minimum threshold
    if (solDiff !== 0 && solDiff * LAMPORTS_PER_SOL < TARGET_WALLET_MIN_TRADE) {
      logSkipped(solDiff);
      logToFile(
        'Skipped',
        TARGET_WALLET_ADDRESS.toString(),
        analyze.dex,
        analyze.type === 'Buy' ? analyze.to.token_address : analyze.type === 'Sell' ? analyze.from.token_address : analyze.from.token_address + analyze.to.token_address,
        analyze.type === 'Buy' ? analyze.from.amount.toString() : analyze.type === 'Sell' ? analyze.to.amount.toString() : '',
        'Below minimum trade size'
      );
      logLine();
      // sound.play(soundFilePaths.buyTrade);
      return;
    }

    if (analyze.from.token_address === analyze.to.token_address) {
      logCircular();
      return;
    }
    logLine();

    let swapResult: { success: boolean; signature: string | null } = {
      success: false,
      signature: null,
    };

    // Copy the buy action of target wallet
    if (analyze.type === 'Buy') {
      // sound.play(soundFilePaths.buyTradeCopied);
      const mintOut = new PublicKey(analyze.to.token_address);

      // Execute the purchase transaction
      if (analyze.dex === 'Raydium' && analyze.pool_address) {
        swapResult = await raydiumSwap(SOL_ADDRESS, new PublicKey(analyze.pool_address), TRADE_AMOUNT);
      } else if (analyze.dex === 'Jupiter') {
        swapResult = await jupiterSwap(SOL_ADDRESS, mintOut, TRADE_AMOUNT);
      }

      // If purchase succeeds
      if (swapResult.success && swapResult.signature) {
        const transaction = await connection1.getParsedTransaction(swapResult.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (!transaction) {
          throw new Error(`Invalid transaction signature ${swapResult.signature}.`);
        }

        // const swapSize = await getRaydiumTradeSize(transaction, SOL_ADDRESS, mintOut, WALLET.publicKey);
        let tokenAmount = 0;
        if (analyze.dex === 'Raydium') {
          const swapSize = await getRaydiumTradeSize(transaction, SOL_ADDRESS, mintOut, WALLET.publicKey);
          tokenAmount = swapSize.to.amount;
        } else {
          const transfers = await getJupiterTransfers(transaction);
          tokenAmount = transfers[1].amount / 10 ** analyze.to.decimals;
        }

        // Add token to buy token list
        buyTokenList.push({
          amount: tokenAmount,
          dex: analyze.dex,
          fee: 0,
          mint: mintOut,
          sold: false,
          decimals: analyze.to.decimals,
          symbol: analyze.to.symbol,
          pool: analyze.pool_address,
        });

        logToFile('Buy Success', TARGET_WALLET_ADDRESS.toString(), analyze.dex, mintOut.toString(), tokenAmount.toString(), 'Succeed copying buy.');

        logBuyOrSellTrigeer(true, TRADE_AMOUNT / 1_000_000_000, tokenAmount, analyze.to.symbol); // Log the purchase success message

        // If purchase failed
      } else {
        handleError('Purchase failed');
      }

      // Copy the sell action of target wallet
    } else if (analyze.type === 'Sell') {
      // sound.play(soundFilePaths.sellTradeCopied);

      const mintIn = new PublicKey(analyze.from.token_address);

      // Find the index of token in token list
      const index = buyTokenList.findIndex((token) => token.mint.equals(mintIn));

      // Skip if you never bought this token
      if (index === -1) {
        return;
      }
      const token = buyTokenList[index];

      // Execute swap
      if (analyze.dex === 'Raydium' && analyze.pool_address) {
        swapResult = await raydiumSwap(mintIn, new PublicKey(analyze.pool_address), Math.floor(token.amount * 10 ** token.decimals));
      } else if (analyze.dex === 'Jupiter') {
        swapResult = await jupiterSwap(mintIn, SOL_ADDRESS, Math.floor(token.amount * 10 ** token.decimals));
      }

      // If sale succeeds
      if (swapResult.success && swapResult.signature) {
        const { diffSol, profit } = await calculateProfit(swapResult.signature, token, analyze.dex);
        logBuyOrSellTrigeer(false, diffSol, 100, analyze.to.symbol, profit.toString()); // Log sale success message

        buyTokenList.splice(index, 1); // Remove the token from buy list
        logToFile('Sell Success', TARGET_WALLET_ADDRESS.toString(), analyze.dex, mintIn.toString(), diffSol.toString(), 'Succeed copying sell.');

        // If sale failed
      } else {
        handleError('Sale failed');
      }
    }
  } catch (error: any) {
    handleError(error.message || 'Unexpected error while processing the transaction.');
  }
}

async function calculateProfit(signature: string, token: TokenListType, dex: string) {
  try {
    const transaction = await connection1.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) {
      throw new Error(`No transaction with this signature: ${signature}`);
    }

    let amount = 0;
    if (dex === 'Jupiter') {
      const transfers = getJupiterTransfers(transaction);
      amount = transfers[1].amount / 10 ** token.decimals;
    } else {
      const swapSize = await getRaydiumTradeSize(transaction, SOL_ADDRESS, token.mint, RAYDIUM_AUTHORITY_V4);
      amount = swapSize.to.amount;
    }

    const usedSol = TRADE_AMOUNT / LAMPORTS_PER_SOL + token.fee;
    const profit = ((amount - usedSol) * 100) / usedSol;

    return { diffSol: amount, profit };
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while calculating profit.');
  }
}

// Get the first and last transfers
function getJupiterTransfers(transaction: ParsedTransactionWithMeta) {
  try {
    const instructions = transaction.transaction.message.instructions as PartiallyDecodedInstruction[];

    const startIxIdx = instructions.findIndex((ix) => {
      return ix.programId.equals(JUPITER_AGGREGATOR_V6);
    });

    const lastIxIdx =
      instructions.length -
      instructions.reverse().findIndex((ix) => {
        return ix.programId.equals(JUPITER_AGGREGATOR_V6);
      }) -
      1;

    if (lastIxIdx === -1) {
      throw new Error('Non Jupiter Swap');
    }

    console.log('lastIxIdx', lastIxIdx, startIxIdx);

    const transfers: { amount: any; source: any; destination: any; authority: any }[] = [];
    transaction.meta?.innerInstructions?.forEach((instruction) => {
      if (instruction.index <= lastIxIdx && instruction.index >= startIxIdx) {
        (instruction.instructions as ParsedInstruction[]).forEach((ix) => {
          if (ix.parsed?.type === 'transfer' && ix.parsed.info.amount) {
            transfers.push({
              amount: ix.parsed.info.amount,
              source: ix.parsed.info.source,
              destination: ix.parsed.info.destination,
              authority: ix.parsed.info.authority,
            });
          } else if (ix.parsed?.type === 'transferChecked' && ix.parsed.info.tokenAmount.amount) {
            transfers.push({
              amount: ix.parsed.info.tokenAmount.amount,
              source: ix.parsed.info.source,
              destination: ix.parsed.info.destination,
              authority: ix.parsed.info.authority,
            });
          }
        });
      }
    });

    console.log('transfers', transfers);

    if (transfers.length < 2) {
      throw new Error('Invalid Jupiter Swap');
    }

    return [transfers[0], transfers[transfers.length - 1].authority === TARGET_WALLET_ADDRESS.toString() ? transfers[transfers.length - 2] : transfers[transfers.length - 1]];
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while extracting transfers from jupiter dex.');
  }
}

/**
 * Analyzes transaction
 */
async function analyzeTransaction(transaction: ParsedTransactionWithMeta, signature: string, dex: string) {
  try {
    const instructions = transaction.transaction.message.instructions as PartiallyDecodedInstruction[];

    if (dex === 'Jupiter') {
      const transfers = getJupiterTransfers(transaction);

      const [tokenIn, tokenOut] = await Promise.all([
        getTokenMintAddress(transfers[0].source, transfers[0].destination),
        getTokenMintAddress(transfers[1].source, transfers[1].destination),
      ]);

      return {
        signature,
        target_wallet: TARGET_WALLET_ADDRESS.toString(),
        type: tokenIn?.mint === SOL_ADDRESS.toString() ? 'Buy' : tokenOut?.mint === SOL_ADDRESS.toString() ? 'Sell' : 'Swap',
        dex,
        pool_address: null,
        from: {
          token_address: tokenIn?.mint as string,
          amount: (transfers[0].amount as number) / 10 ** (tokenIn?.decimals || 0),
          symbol: tokenIn?.symbol,
          decimals: tokenIn?.decimals,
        },
        to: {
          token_address: tokenOut?.mint as string,
          amount: (transfers[1].amount as number) / 10 ** (tokenOut?.decimals || 0),
          symbol: tokenOut?.symbol,
          decimals: tokenOut?.decimals,
        },
      } as AnalyzeType;
    } else {
      // SmartFox Get all instructions from transaction
      const instrsWithAccs = instructions.filter((ix) => ix.accounts && ix.accounts.length > 0);

      let poolAccounts: PublicKey[] = [];

      // SmartFox Loop until will find the account that its owner is RAYDIUM_LIQUIDITYPOOL_V4
      for (const ix of instrsWithAccs) {
        const accounts = ix.accounts.filter((acc) => acc.toString() !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        for (const acc of accounts) {
          const poolInfo = await connection1.getAccountInfo(acc, { commitment: 'confirmed' });

          if (poolInfo?.owner.equals(RAYDIUM_LIQUIDITYPOOL_V4) && poolInfo.data.length === 752 && !poolAccounts.some((p) => p.equals(acc))) {
            poolAccounts.push(acc);
          }
        }
      }

      if (poolAccounts.length === 0) {
        throw new Error('No Raydium or Jupiter swap transaction.');
      }

      let fromInfor: TokenInforType;
      let toInfor: TokenInforType;
      let type: string = '';
      let from: { mint: PublicKey; amount: number };
      let to: { mint: PublicKey; amount: number };

      if (poolAccounts.length === 1) {
        const { baseMint, quoteMint } = await getInforFromRaydiumPool(poolAccounts[0]);
        const trade = await getRaydiumTradeSize(transaction, baseMint, quoteMint, RAYDIUM_AUTHORITY_V4);
        from = trade.to;
        to = trade.from;
        fromInfor = await getTokenInfo(connection1, from.mint);
        toInfor = await getTokenInfo(connection1, to.mint);
        type = trade.type === 'Sell' ? 'Buy' : trade.type === 'Buy' ? 'Sell' : 'Swap';
      } else {
        const { baseMint: baseMint1, quoteMint: quoteMint1 } = await getInforFromRaydiumPool(poolAccounts[0]);
        const { baseMint: baseMint2, quoteMint: quoteMint2 } = await getInforFromRaydiumPool(poolAccounts[poolAccounts.length - 1]);

        ({ from } = await getRaydiumTradeSize(transaction, baseMint1, quoteMint1, TARGET_WALLET_ADDRESS));
        ({ to } = await getRaydiumTradeSize(transaction, baseMint2, quoteMint2, TARGET_WALLET_ADDRESS));

        fromInfor = await getTokenInfo(connection1, from.mint);
        toInfor = await getTokenInfo(connection1, to.mint);
        type = 'Swap';
      }

      return {
        signature,
        target_wallet: TARGET_WALLET_ADDRESS.toString(),
        type,
        dex,
        pool_address: poolAccounts[0].toString(),
        from: {
          token_address: fromInfor.address,
          amount: from.amount,
          symbol: fromInfor.symbol,
          decimals: fromInfor.decimals,
        },
        to: {
          token_address: toInfor.address,
          amount: to.amount,
          symbol: toInfor.symbol,
          decimals: toInfor.decimals,
        },
      } as AnalyzeType;
    }
  } catch (error: any) {
    console.error(error);
    throw new Error(error.message || 'Unexpected error while analyzing transaction.');
  }
}

async function getRaydiumTradeSize(transaction: ParsedTransactionWithMeta, baseMint: PublicKey, quoteMint: PublicKey, owner: PublicKey) {
  try {
    const postTokenBalances = transaction.meta?.postTokenBalances?.filter((p) => p.owner === owner.toString());
    const preTokenBalances = transaction.meta?.preTokenBalances?.filter((p) => p.owner === owner.toString());

    const basePostTokenBal = postTokenBalances?.find((p) => p.mint === baseMint?.toString())?.uiTokenAmount.uiAmount || 0;
    const basePreTokenBal = preTokenBalances?.find((p) => p.mint === baseMint?.toString())?.uiTokenAmount.uiAmount || 0;

    const quotePostTokenBal = postTokenBalances?.find((p) => p.mint === quoteMint?.toString())?.uiTokenAmount.uiAmount || 0;
    const quotePreTokenBal = preTokenBalances?.find((p) => p.mint === quoteMint?.toString())?.uiTokenAmount.uiAmount || 0;

    const baseDiff = new BigNumber(basePostTokenBal).minus(new BigNumber(basePreTokenBal)).toNumber();
    const quoteDiff = new BigNumber(quotePostTokenBal).minus(new BigNumber(quotePreTokenBal)).toNumber();

    const [less, lessA, bigger, biggerA] =
      baseDiff < 0 ? [baseMint, baseDiff, quoteMint, quoteDiff] : quoteDiff < 0 ? [quoteMint, quoteDiff, baseMint, baseDiff] : [baseMint, baseDiff, quoteMint, quoteDiff];

    let type = '';
    if (less.equals(SOL_ADDRESS)) {
      type = 'Buy';
    } else if (bigger.equals(SOL_ADDRESS)) {
      type = 'Sell';
    } else {
      type = 'Swap';
    }

    return {
      from: {
        mint: less,
        amount: Math.abs(lessA),
      },
      to: {
        mint: bigger,
        amount: biggerA,
      },
      type,
    };
  } catch (error: any) {
    throw new Error(error.message || '');
  }
}

async function getTokenMintAddress(source: string, destination: string) {
  try {
    let accountInfo = await connection1.getParsedAccountInfo(new PublicKey(source));
    if (!accountInfo.value) accountInfo = await connection1.getParsedAccountInfo(new PublicKey(destination));
    const tokenInfo = (accountInfo.value?.data as ParsedAccountData).parsed?.info;
    const tokenInfor = await getTokenInfo(connection1, new PublicKey(tokenInfo?.mint));
    const symbol = tokenInfor?.address !== SOL_ADDRESS.toString() && tokenInfor?.symbol === 'SOL' ? 'SPL Token' : tokenInfor?.symbol;
    return {
      mint: tokenInfo?.mint || null,
      decimals: Number(tokenInfo?.tokenAmount?.decimals),
      symbol,
    };
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while fetching token mint address.');
  }
}

async function monitorToSell() {
  try {
    while (true) {
      const indexesToDel: number[] = [];
      await Promise.all(
        buyTokenList.map(async (token, index) => {
          let success: boolean = false;
          let signature: string | null = null;

          // If token is bought on Jupiter dex
          if (token.dex === 'Jupiter') {
            const quote = await getQuoteForSwap(token.mint.toString(), SOL_ADDRESS.toString(), token.amount * 10 ** token.decimals, SLIPPAGE);
            if (quote.error) {
              return;
            }
            const targetAmount = Math.floor(TRADE_AMOUNT * LIMIT_ORDER); // target profit

            // If sell is non profitable
            if (Number(quote.outAmount) < targetAmount) {
              return;
            }

            // sound.play(soundFilePaths.sellTrade);
            // Sell token if its profitable
            ({ success, signature } = await jupiterSwap(token.mint, SOL_ADDRESS, Math.floor(token.amount * 10 ** token.decimals)));

            // If token is bought on Raydium dex
          } else {
            const mint = token.mint;
            const pool = token.pool;

            // Return if no pool or non profitable
            if (!pool || (pool && !(await isProfitable(mint, new PublicKey(pool))))) {
              return;
            }
            // sound.play(soundFilePaths.sellTrade);

            ({ success, signature } = await raydiumSwap(mint, new PublicKey(pool), token.amount * 10 ** token.decimals));
          }

          // Successfully sold the token
          if (success && signature) {
            const { diffSol, profit } = await calculateProfit(signature, token, 'Raydium');
            logBuyOrSellTrigeer(false, diffSol, 100, token.symbol, profit.toString()); // Log sale success message

            indexesToDel.unshift(index); // Add index of item to remove
            logToFile('Sell Success', TARGET_WALLET_ADDRESS.toString(), token.dex, token.mint.toString(), diffSol.toString(), 'Auto sell triggered');

            // If sale failed
          } else {
            handleError('Sale failed');
          }
        })
      );

      for (const index of indexesToDel) {
        buyTokenList.splice(index, 1);
      }
      await sleep(5000);
    }
  } catch (error: any) {
    handleError(error.message || 'Unexpected error while monitoring the point to sell token.');
  }
}

async function isProfitable(mint: PublicKey, pool: PublicKey) {
  try {
    const targetProfit = Math.floor(TRADE_AMOUNT * LIMIT_ORDER);
    const tokenBalance = await getATABalance(mint, WALLET.publicKey);
    const [solReserve, baseReserve] = await getReserves(mint, pool);

    const expectedSolAmount = expectAmountOut(tokenBalance, baseReserve, solReserve);

    if (expectedSolAmount > BigInt(targetProfit)) {
      return true;
    }
    return false;
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while calculating the profitability.');
  }
}

async function getATABalance(mint: PublicKey, owner: PublicKey) {
  try {
    const mintATA = getAssociatedTokenAddressSync(mint, owner);
    const tokenBalanceString = (await connection1.getTokenAccountBalance(mintATA)).value.amount;
    return BigInt(tokenBalanceString);
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while fetching ATA balance.');
  }
}

// OB get token info
async function getTokenInfo(connection: Connection, mint: PublicKey): Promise<TokenInforType> {
  const metaplex = Metaplex.make(connection);

  try {
    const tokenMetadata = await metaplex.nfts().findByMint({ mintAddress: mint });
    return {
      name: tokenMetadata.name,
      symbol: tokenMetadata.symbol,
      address: tokenMetadata.address.toString(),
      decimals: tokenMetadata.mint.decimals,
    };
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while fetching information of token.');
  }
}

// Monitor target wallet's trade
// monitorNewToken();

// Monitor whether it's profitable to sell the token.
// If so perform tradingm otherwise skip.
// monitorToSell();

bot
  .launch()
  .then(() => {
    console.log('Bot is running...');
  })
  .catch((err) => {
    console.error(err);
  });

process.on('SIGINT', () => {
  bot.stop();
  console.log('Successfully stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  bot.stop();
  console.log('Successfully stopped');
  process.exit(0);
});

import { BN } from '@coral-xyz/anchor';
import { ApiV3PoolInfoStandardItem, Raydium, liquidityStateV4Layout } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import { WALLET, connection1 } from './config';

export async function getInforFromRaydiumPool(pool: PublicKey) {
  try {
    const poolInfo = await connection1.getAccountInfo(pool, { commitment: 'confirmed' });
    if (!poolInfo) {
      throw new Error('Invalid Raydium pool account.');
    }

    const { baseMint, quoteMint } = liquidityStateV4Layout.decode(poolInfo?.data);

    return { baseMint: baseMint, quoteMint: quoteMint };
  } catch (error: any) {
    throw new Error(error.message || 'Error while decoding information of pool.');
  }
}

export async function getReserves(mint: PublicKey, pool: PublicKey) {
  try {
    const raydium = await Raydium.load({
      connection: connection1,
      owner: WALLET,
    });

    const poolKeys = await raydium.liquidity.getRpcPoolInfo(pool.toString());
    const isCorrectOrder = poolKeys.baseMint.toString() === mint.toString() ? true : false;
    const baseVault = isCorrectOrder ? poolKeys.baseVault : poolKeys.quoteVault;
    const quoteVault = isCorrectOrder ? poolKeys.quoteVault : poolKeys.baseVault;

    const lpReserve = (await connection1.getMultipleParsedAccounts([baseVault, quoteVault])).value;
    const baseData: any = lpReserve[0]?.data;
    const quoteData: any = lpReserve[1]?.data;
    const baseReserve = BigInt(baseData['parsed']['info']['tokenAmount']['amount']);
    const solReserve = BigInt(quoteData['parsed']['info']['tokenAmount']['amount']);
    return [solReserve, baseReserve];
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while fetching reserves of pool.');
  }
}

export function expectAmountOut(tokenAmount: bigint, tokenReserve: bigint, solReserve: bigint) {
  const outAmount = (tokenAmount * solReserve) / (tokenReserve + tokenAmount);
  return outAmount;
}

// SmartFox Swap on raydium dex
export async function raydiumSwap(mintInPub: PublicKey, pool: PublicKey, inAmount: number) {
  try {
    const raydium = await Raydium.load({
      connection: connection1,
      owner: WALLET,
    });

    const poolKeys = await raydium.liquidity.getAmmPoolKeys(pool.toString());
    const poolInfo = (await raydium.api.fetchPoolById({ ids: pool.toString() }))[0] as ApiV3PoolInfoStandardItem;
    const rpcData = await raydium.liquidity.getRpcPoolInfo(pool.toString());

    console.log('poolInfo', poolInfo, pool.toString());

    const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()];
    const baseIn = mintInPub.toString() === poolInfo.mintA.address;
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];

    const out = raydium.liquidity.computeAmountOut({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      },
      amountIn: new BN(inAmount),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: 0.1,
    });

    const { execute } = await raydium.liquidity.swap({
      poolInfo,
      poolKeys,
      amountIn: new BN(inAmount),
      amountOut: out.minAmountOut,
      fixedSide: 'in',
      inputMint: mintIn.address,
      computeBudgetConfig: {
        microLamports: 1000000,
        units: 500000,
      },
    });

    const { txId } = await execute({ sendAndConfirm: true });

    if (txId) {
      return { success: true, signature: txId };
    } else {
      return { success: false, signature: null };
    }
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while swapping on Raydium');
  }
}

import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SLIPPAGE, WALLET, connection1 } from './config';

export async function getQuoteForSwap(inputAddr: string, outputAddr: string, amount: number, slippageBps: number) {
  try {
    const response = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputAddr}&outputMint=${outputAddr}&amount=${amount}&slippageBps=${slippageBps}`
    );
    const quote: any = await response.json();
    if (quote.error) {
      throw new Error(quote.error);
    }
    return quote;
  } catch (error: any) {
    console.error('Error while getQuoteForSwap:', error);
    throw new Error(error.message || 'Unexpected error while fetch the quote for swap');
  }
}

export async function getSerializedTransaction(quote: any, publicKey: string, priorityFee: number) {
  try {
    const response = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: publicKey,
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: priorityFee,
      }),
    });
    const { swapTransaction } = (await response.json()) as any;
    return swapTransaction;
  } catch (error) {
    console.log('Error while getSerializedTransaction:', error);
    throw new Error('Error while getSerializedTransaction');
  }
}

export async function getDeserialize(swapTransaction: string) {
  try {
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    return transaction;
  } catch (error) {
    console.error('Error while getDeserialize:', error);
    throw new Error('Error while getDeserialize');
  }
}

export async function executeTransaction(connection: Connection, transaction: VersionedTransaction) {
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    const rawTransaction = transaction.serialize();
    const signature = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 5,
    });

    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature,
    });
    return { success: true, signature: signature };
  } catch (error) {
    console.error('Error while executeTransaction:', error);
    return { success: false, signature: '' };
  }
}

export async function jupiterSwap(mintIn: PublicKey, mintOut: PublicKey, inAmount: number) {
  try {
    const quote = await getQuoteForSwap(mintIn.toString(), mintOut.toString(), inAmount, SLIPPAGE);

    const swapTransaction = await getSerializedTransaction(quote, WALLET.publicKey.toString(), 500000);

    const deserializedTx = await getDeserialize(swapTransaction);

    deserializedTx.sign([WALLET]);

    const { signature, success } = await executeTransaction(connection1, deserializedTx);

    if (success) {
      return { success, signature };
    } else {
      return { success, signature: null };
    }
  } catch (error: any) {
    throw new Error(error.message || 'Unexpected error while swapping on Jupiter.');
  }
}

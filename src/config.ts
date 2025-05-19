import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import { TokenListType } from './types';

// Initialize parameters from environment variables
export const connection1 = new Connection(process.env.CONNECTION_URL || '', {
  wsEndpoint: process.env.CONNECTION_WSS_URL || '',
  commitment: 'confirmed',
});
// export const connection2 = new Connection(process.env.CONNECTION_URL_2 || '', {
//   wsEndpoint: process.env.CONNECTION_WSS_URL_2,
//   commitment: 'confirmed',
// });
export const TARGET_WALLET_ADDRESS = new PublicKey(process.env.TARGET_WALLET_ADDRESS || '');
export const TARGET_WALLET_MIN_TRADE = parseInt(process.env.TARGET_WALLET_MIN_TRADE || '0');
export const RAYDIUM_LIQUIDITYPOOL_V4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
export const RAYDIUM_AUTHORITY_V4 = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
export const JUPITER_AGGREGATOR_V6 = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
export const SOL_ADDRESS = new PublicKey('So11111111111111111111111111111111111111112');
export const WALLET = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY || ''));
export const TRADE_AMOUNT = parseInt(process.env.TRADE_AMOUNT || '0');
export const COMPUTE_PRICE = 100000;
export const LIMIT_ORDER = 1.25; // for test
export const SLIPPAGE = 500;
export const ERROR_SOUND_SKIP_TIME = 10000;
export const BOT_TOKEN = process.env.BOT_TOKEN || '';

/*
 * Trade log filename (ensure it is ignored by Git)
 * TODO: Specify through configuration file
 */

export const LOG_FILE = 'trade_log.csv';

// Create log file if not exists and add headers
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, 'Timestamp, Action, Wallet, Token, Amount (SOL), Reason\n');
}

/**
 * How many latest transactions to check for target wallet with each main loop iteration
 */
export const signaturesForAddressLimitCount = 10;

/**
 * Stores transaction signatures which has been already processed.
 * Used to prevent processing transactions more than once.
 */
export const processedTransactionSignatures: string[] = [];

/**
 * How many processed transaction signatures to store at most.
 * This value must be higher than signaturesForAddressLimitCount but not too much. x10 is probably enough.
 */
export const processedTransactionSignaturesLimitCount = signaturesForAddressLimitCount * 10;

export let buyTokenList: TokenListType[] = [];

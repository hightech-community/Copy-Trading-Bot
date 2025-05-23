# Solana Copy Trading Bot

## Overview

The Solana Copy Trading Bot is an automated trading solution designed to replicate token buy and sell trades from specific Solana wallets in real time. The bot leverages the Solana blockchain’s capabilities along with the Helius API to monitor target wallets and execute trades based on pre-defined rules such as Take Profit (TP). The bot is designed for Windows environments and is suitable for users with basic to intermediate technical knowledge.

This bot only monitors target wallet. 🤔\
The bot with all functionalties is behind the scenes. 😉

---

## Features

- **Real-Time Trade Copying**:
  - Monitors a single target Solana wallet for buy/sell activity.
  - Automatically replicates trades on your designated wallet.

- **Customizable Trade Parameters**:
  - Define trade size.
  - Set Take Profit (TP) thresholds for trades.
  - Define a minimum trade size threshold for copying target wallet trades.

- **Transaction Safety**:
  - Only sells tokens if:
    - The source wallet sells the token.
    - TP targets are triggered.
	- 100% of the token held in your wallet is sold when the tracked wallet sells the same token.

- **Support for Liquidity Pools**:
  - Integrates with Raydium Liquidity Pool for token swaps (does not trade on riskier marketplaces such as pump.fun).

- **Ease of Use**:
  - Configuration via `.env` and `config.ts` files.
  - Human-readable JSON logs for tracking trades.

- **Utilises Wrapped Solana (WSOL)**:
  - The bot uses WSOL for all trading activities. Ensure your wallet has sufficient WSOL before running the bot.
  - Refer to the [Copy Trading - Prepare Wallet with WSOL](copy-trading-get-wsol.pdf) guide for detailed steps to prepare your wallet.

---

## Prerequisites

To run the Solana Copy Trading Bot, ensure you have the following:

1. **Windows Pro PC**
2. **Software Requirements**:
   - Node.js (v16 or higher)
   - TypeScript
   - Yarn (optional, if preferred over npm)
3. **Accounts and API Keys**:
   - A Solana wallet (private key required).
   - Helius RPC API key (for blockchain interaction).
4. **Dependencies**:
   - `@solana/web3.js`
   - `@raydium-io/raydium-sdk`
   - `dotenv`
   - `bs58`

---

## Setup Instructions

### Step 1: Install Required Software

1. Download and install [Node.js](https://nodejs.org/).
2. Verify installation:
   ```
   node -v
   npm -v
   ```

### Step 2: Clone the Repository

1. Clone the repository to your local machine:
   ```
   git clone https://github.com/HereForYou/Smart-Copy-Trading-Bot.git
   ```
2. Navigate to the project directory:
   ```
   cd copy-trading-bot
   ```

After cloning the repository, the folder structure will look like this:

```plaintext
copy-trading-bot/
├── src/
│   ├── index.ts
│   ├── utils.ts
├── .env.sample
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.json
```

### Step 3: Install Dependencies

Run the following command to install all required dependencies:
```
npm install
```

### Step 4: Configure the Bot

1. Copy `.env.sample` to a file with another name and extension `.env`, e. g. `.env`.
Extension `.env` ensures this file will not be tracked by Git according to `.gitignore` file rules.
   ```bash
   cp .env.sample .env
   ```
2. Open `.env` and fill in the required details:
   - `CONNECTION_URL`: Replace the placeholder API key with your actual Helius API key.
   - `CONNECTION_WSS_URL`: Replace the placeholder API key with your actual Helius API key.
   - `TARGET_WALLET_ADDRESS`: Public key of the wallet to copy trades from.
   - `WALLET_PRIVATE_KEY`: Replace with your private key (base58-encoded).
   - `TRADE_AMOUNT`: Replace with your desired amount of individual trade, in lamports.

The bot's configuration follows this flow:
- `.env`: Contains sensitive and private information such as API keys, target wallet address, and wallet private key. This file is stored locally and not shared on GitHub.
- `index.ts`: Main bot logic file that uses parameters defined in `.env` to perform trading actions.

### Step 5: Install TypeScript

1. Ensure TypeScript is installed globally by running:
   ```
   tsc --version
   ```
2. If TypeScript is not recognized, install it globally:
   ```
   npm install -g typescript
   ```
3. Verify the installation by running:
   ```
   tsc --version
   ```

### Step 6: Running the Bot

1. Build the project: compile the TypeScript code into JavaScript to generate the `dist` folder and compiled `.js` files:
   ```
   npm run build
   ```
2. Verify that the `dist` folder is created and contains the compiled `.js` files.

2. Run the bot specifying path to your configuration file `my_config.env` (or whatever name you have chosen at step 4.1).
Note that the bot is running in its own `dist` folder, therefore you need to specify that configuration file is located in parent folder using `..` notation:
```bash
npm run dev
```

3. You should see a message similar to:
   ```
   Waiting to copy trade wallet ...PNAQ3
   ```

---

## Configuration Guide

### Key Parameters in `.env.sample`

| Parameter              | Description                                                                                  |
|------------------------|----------------------------------------------------------------------------------------------|
| `CONNECTION_URL`       | The HTTP RPC url, use premium for good performance                                           |
| `CONNECTION_WSS_URL`   | The WSS RPC url, use premium for good performance                                            |
| `TARGET_WALLET_ADDRESS`| The wallet address to monitor for trades.                                                    |
| `TARGET_WALLET_MIN_TRADE` | Minimum trade size (in lamports) to copy. Trades below this value will be ignored.           |
| `WALLET_PRIVATE_KEY`   | Your trading wallet’s private key in base58 format.                                          |
| `TRADE_AMOUNT`         | Amount to trade per transaction (in lamports; 1 WSOL = 1,000,000,000 lamports).              |

---

## Usage

1. Ensure the bot is running by executing:
   ```bash
   npm run dev
   ```
2. Monitor the console for real-time logs of:
   - Tokens bought and sold.
   - Current holdings and performance.

3. Edit `.env` to adjust trade parameters and restart the bot if changes are made.

---

## Troubleshooting

| Issue                                     | Solution                                                                              |
|-------------------------------------------|--------------------------------------------------------------------------------------|
| Bot fails to start                        | Verify Node.js and TypeScript installations. Ensure dependencies are installed.       |
| Transactions not being copied             | Check `TARGET_WALLET_ADDRESS` and ensure the Helius API key is valid.                 |
| Unexpected token behavior                 | Ensure `TRADE_AMOUNT` is correctly set in lamports.                                   |
| Logs not updating                         | Check the bot’s connection to the Solana network. Restart if necessary.               |

---

## Example Copy Trades

Below are screenshots illustrating the bot correctly tracking the target wallet:

1. **Copy Trade Example 1**: The tracked wallet swaps tokens on Jupiter dex.

   ![Copy Trading Example 1](Copy-Trading-Jupiter.jpg)

2. **Copy Trade Example 2**: The tracked wallet buys several tokens using WSOL on Raydium dex.

   ![Copy Trading Example 2](Copy-Trading-Raydium.jpg)

---

## Recent Improvements (Updated January 10, 2025)

1. **Minimum Value of Target Wallet Trade**:
   - The bot now includes the ability to filter trades based on a configurable minimum trade size (e.g., `TARGET_WALLET_MIN_TRADE`). Trades below this threshold will be ignored, ensuring only "high commitment" trades are copied.
   
2. **Target Wallet Check Interval**:
   - The interval for checking the target wallet's activity has been changed from 400 milliseconds to 5 seconds (5000 milliseconds). This reduces API usage and ensures more efficient monitoring while maintaining timely updates.

3. **Historical Transaction Filtering**:
   - The bot now includes timestamp filtering logic to ensure only new transactions are processed. Historical transactions that occurred before the bot started running are ignored.
  
4. **Log Reporting**:
   - The bot now logs all trades and reasons for non-copied trades in CSV format. This includes timestamps, actions, wallet addresses, token details, amounts, and explanatory reasons. The log file can be opened in Excel for easy analysis.

5. **Sound Alerts**:
  - Audio notifications added for significant events (e.g., bot start, trades detected, errors).

---

## Future Improvements

1. **Masking Bot Trades from Target Wallet**:
   - Consider advanced strategies for "front-running mitigation" or "transaction privacy," that can help obfuscate or disguise the activities of our bot (refer to Solana-Copy-Trading-Bot-Masking-Trades.pdf) for concepts.

2. **Support for Multiple Wallets**:
   - Enable tracking and copying trades from multiple Solana wallets simultaneously.

3. **Optional Token Liquidity Check**:
   - Implement a feature to evaluate token liquidity during tracked wallet buys and proceed with the trade only if liquidity is sufficient to avoid adverse price impacts.

4. **Optional Stop Loss (SL) Setting for Each Wallet**:
   - Add the ability to specify a Stop Loss percentage for each wallet, triggering an automatic sell if the SL threshold is reached.
   - **Developer response**: "This is impossible because of RPC node server issues. Without our own local node server, we cannot implement subscription-based functions such as a Stop Loss."

---

## License

This project is licensed under the MIT License. See `LICENSE` for details.

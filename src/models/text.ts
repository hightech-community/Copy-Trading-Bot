import { User } from './user';

export const startText = (user: User) => {
  return (
    `SmartFoxBot | Wallet Tracker\n\n` +
    `This bot helps you monitor transactions across your Solana wallets. After adding wallets, you'll receive immediate notifications for any activity.\n\n`
  );
};

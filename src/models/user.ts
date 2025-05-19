import { Document, Schema, model } from 'mongoose';

export interface User extends Document {
  tgId: number;
  username: string;
  notifyOn: boolean;
  autoTrade: boolean;
  tradeAmount: number;
  priorityFee: number;
  wallet: {
    secretKey: string;
    publicKey: string;
  };
}

const UserSchema = new Schema({
  tgId: { type: Number, required: true },
  username: { type: String, default: '' },
  notifyOn: { type: Boolean, default: true },
  autoTrade: { type: Boolean, default: false },
  tradeAmount: { type: Number, default: 0 },
  priorityFee: { type: String, default: 0.0005 },
  wallet: {
    secretKey: { type: String, required: true },
    publicKey: { type: String, required: true },
  },
  targetWallets: [
    {
      address: {
        type: String,
        required: true,
      },
      status: {
        type: String,
        required: true,
      },
    },
  ],
});

export const User = model<User>('User', UserSchema, 'User');

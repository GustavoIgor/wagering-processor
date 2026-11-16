import { Wallet } from '../../domain/wallet/wallet.js';

export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');

export interface WalletRepository {
  save(wallet: Wallet): Promise<void>;
  findById(id: string): Promise<Wallet | null>;
}

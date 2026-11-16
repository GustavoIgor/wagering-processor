import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { Wallet } from '../../domain/wallet/wallet.js';
import { WALLET_REPOSITORY } from '../ports/wallet.repository.js';
import type { WalletRepository } from '../ports/wallet.repository.js';
@Injectable()
export class OpenWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(playerId: string, currency: string): Promise<Wallet> {
    const wallet = Wallet.open(randomUUID(), playerId, currency);

    await this.walletRepository.save(wallet);

    return wallet;
  }
}

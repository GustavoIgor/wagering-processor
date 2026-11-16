import { Injectable, Inject } from '@nestjs/common';

import { WALLET_REPOSITORY } from '../ports/wallet.repository.js';
import type { WalletRepository } from '../ports/wallet.repository.js';
import { WalletNotFoundError } from './wallet-not-found.error.js';

@Injectable()
export class GetWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepository,
  ) {}

  async execute(id: string) {
    const wallet = await this.walletRepository.findById(id);

    if (!wallet) {
      throw new WalletNotFoundError();
    }

    return wallet;
  }
}

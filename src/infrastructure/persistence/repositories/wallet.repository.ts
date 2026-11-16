import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Wallet } from '../../../domain/wallet/wallet.js';
import { WalletRepository } from '../../../application/ports/wallet.repository.js';
import { WalletEntity } from '../entities/wallet.entity.js';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { WalletAlreadyExistsError } from '../../../application/wallets/wallet-already-exists.error.js';

@Injectable()
export class MikroOrmWalletRepository implements WalletRepository {
  constructor(private readonly em: EntityManager) {}

  async save(wallet: Wallet): Promise<void> {
    const now = new Date();

    const entity = this.em.create(WalletEntity, {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toDecimalString(),
      createdAt: now,
      updatedAt: now,
    });

    try {
      this.em.persist(entity);
      await this.em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new WalletAlreadyExistsError();
      }

      throw error;
    }
  }

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { id });

    if (!entity) {
      return null;
    }

    return Wallet.restore(
      entity.id,
      entity.playerId,
      entity.currency,
      entity.balance,
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { Money } from '../../domain/shared/money/money.js';
import { WagerTransaction } from '../../domain/wagering/wager-transaction.js';
import type { WagerOperation } from '../../domain/wagering/wager-transaction.js';

import { WAGERING_REPOSITORY } from '../ports/wagering.repository.js';
import type { WageringRepository } from '../ports/wagering.repository.js';

interface ProcessWagerInput {
  providerId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  operation: WagerOperation;
  amount: string;
  currency: string;
  referenceTransactionId?: string;
}

@Injectable()
export class ProcessWagerUseCase {
  constructor(
    @Inject(WAGERING_REPOSITORY)
    private readonly wageringRepository: WageringRepository,
  ) {}

  async execute(
    input: ProcessWagerInput,
    idempotencyKey: string,
  ): Promise<WagerTransaction> {
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.length > 128
    ) {
      throw new Error('Invalid idempotency key');
    }

    const amount = Money.from(input.amount, input.currency);

    const transaction = WagerTransaction.create({
      id: randomUUID(),
      providerId: input.providerId,
      playerId: input.playerId,
      walletId: input.walletId,
      roundId: input.roundId,
      operation: input.operation,
      amount,
      referenceTransactionId: input.referenceTransactionId,
    });

    const canonicalPayload = JSON.stringify({
      providerId: input.providerId,
      playerId: input.playerId,
      walletId: input.walletId,
      roundId: input.roundId,
      operation: input.operation,
      amount: amount.toDecimalString(),
      currency: input.currency,
      referenceTransactionId: input.referenceTransactionId ?? null,
    });

    const payloadHash = createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    return this.wageringRepository.process(
      transaction,
      idempotencyKey,
      payloadHash,
    );
  }
}

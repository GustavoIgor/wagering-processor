import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { LockMode } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

import { IdempotencyConflictError } from '../../../application/wagering/idempotency-conflict.error.js';
import type { WageringRepository } from '../../../application/ports/wagering.repository.js';
import { WagerTransaction } from '../../../domain/wagering/wager-transaction.js';
import { Money } from '../../../domain/shared/money/money.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';
import { Wallet } from '../../../domain/wallet/wallet.js';
import { WalletEntity } from '../entities/wallet.entity.js';
import { WalletLedgerEntity } from '../entities/wallet-ledger.entity.js';
import { OutboxEventEntity } from '../entities/outbox-event.entity.js';

type ReversalLedgerData = {
  direction: 'DEBIT' | 'CREDIT';
  reason: 'REFUND' | 'ROLLBACK';
  reversalOfEntryId: string;
};

type ReversalResult = {
  referenceMissing: boolean;
  ledgerData: ReversalLedgerData | null;
};

@Injectable()
export class MikroOrmWageringRepository implements WageringRepository {
  constructor(private readonly em: EntityManager) {}

  private async applyReversal(
    tx: EntityManager,
    transaction: WagerTransaction,
    wallet: Wallet,
  ): Promise<ReversalResult> {
    const referenceId = transaction.referenceTransactionId;

    if (!referenceId) {
      transaction.reject('INVALID_REFERENCE');
      return { referenceMissing: false, ledgerData: null };
    }

    const referenceTransaction = await tx.findOne(WagerTransactionEntity, {
      id: referenceId,
    });

    if (!referenceTransaction) {
      return { referenceMissing: true, ledgerData: null };
    }

    const referenceLedger = await tx.findOne(WalletLedgerEntity, {
      wagerTransactionId: referenceTransaction.id,
    });

    const validReference =
      referenceTransaction.status === 'PROCESSED' &&
      referenceTransaction.providerId === transaction.providerId &&
      referenceTransaction.playerId === transaction.playerId &&
      referenceTransaction.walletId === transaction.walletId &&
      referenceTransaction.roundId === transaction.roundId &&
      referenceTransaction.currency === transaction.amount.currency &&
      Money.from(
        referenceTransaction.amount,
        referenceTransaction.currency,
      ).equals(transaction.amount) &&
      referenceLedger !== null &&
      (transaction.operation === 'ROLLBACK' ||
        (transaction.operation === 'REFUND' &&
          referenceTransaction.operation === 'BET'));

    if (!validReference) {
      transaction.reject('INVALID_REFERENCE');
      return { referenceMissing: false, ledgerData: null };
    }

    const alreadyReversed = await tx.findOne(WalletLedgerEntity, {
      reversalOfEntryId: referenceLedger.id,
    });

    if (alreadyReversed) {
      transaction.reject('ALREADY_REVERSED');
      return { referenceMissing: false, ledgerData: null };
    }

    const direction =
      referenceLedger.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT';

    try {
      if (direction === 'CREDIT') {
        wallet.credit(transaction.amount);
      } else {
        wallet.debit(transaction.amount);
      }

      return {
        referenceMissing: false,
        ledgerData: {
          direction,
          reason: transaction.operation as 'REFUND' | 'ROLLBACK',
          reversalOfEntryId: referenceLedger.id,
        },
      };
    } catch {
      transaction.reject('INSUFFICIENT_FUNDS_FOR_REVERSAL');

      return { referenceMissing: false, ledgerData: null };
    }
  }

  async process(
    transaction: WagerTransaction,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<WagerTransaction> {
    return this.em.transactional(async (tx) => {
      // Serializa requisições com a mesma chave de idempotência.
      await tx
        .getConnection()
        .execute('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
          `${transaction.providerId}:${idempotencyKey}`,
        ]);

      const existing = await tx.findOne(WagerTransactionEntity, {
        providerId: transaction.providerId,
        idempotencyKey,
      });

      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new IdempotencyConflictError();
        }

        return WagerTransaction.restore({
          id: existing.id,
          providerId: existing.providerId,
          playerId: existing.playerId,
          walletId: existing.walletId,
          roundId: existing.roundId,
          operation: existing.operation,
          amount: Money.from(existing.amount, existing.currency),
          referenceTransactionId: existing.referenceTransactionId,
          status: existing.status,
          failureCode: existing.failureCode,
        });
      }

      // Bloqueia a carteira para evitar alterações concorrentes no saldo.
      const walletEntity = await tx.findOne(
        WalletEntity,
        { id: transaction.walletId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

      if (!walletEntity) {
        throw new Error('Wallet not found');
      }

      if (
        walletEntity.playerId !== transaction.playerId ||
        walletEntity.currency !== transaction.amount.currency
      ) {
        throw new Error('Wallet does not match wager transaction');
      }

      const wallet = Wallet.restore(
        walletEntity.id,
        walletEntity.playerId,
        walletEntity.currency,
        walletEntity.balance,
      );

      let ledgerData: {
        direction: 'DEBIT' | 'CREDIT';
        reason: 'BET' | 'WIN' | 'REFUND' | 'ROLLBACK';
        reversalOfEntryId: string | null;
      } | null = null;

      if (transaction.operation === 'BET') {
        try {
          wallet.debit(transaction.amount);
          ledgerData = {
            direction: 'DEBIT',
            reason: 'BET',
            reversalOfEntryId: null,
          };
        } catch {
          transaction.reject('INSUFFICIENT_FUNDS');
        }
      }

      if (transaction.operation === 'WIN') {
        wallet.credit(transaction.amount);
        ledgerData = {
          direction: 'CREDIT',
          reason: 'WIN',
          reversalOfEntryId: null,
        };
      }

      if (transaction.operation === 'LOSS') {
        // LOSS não altera o saldo e não gera lançamento financeiro.
      }

      if (
        transaction.operation === 'REFUND' ||
        transaction.operation === 'ROLLBACK'
      ) {
        const result = await this.applyReversal(tx, transaction, wallet);

        ledgerData = result.ledgerData;

        if (result.referenceMissing) {
          transaction.markPendingReference();
        }
      }

      if (transaction.status === 'PENDING') {
        transaction.markProcessed();
      }

      const now = new Date();

      const isPendingReference = transaction.status === 'PENDING_REFERENCE';

      const wagerEntity = tx.create(WagerTransactionEntity, {
        id: transaction.id,
        providerId: transaction.providerId,
        playerId: transaction.playerId,
        walletId: transaction.walletId,
        roundId: transaction.roundId,
        idempotencyKey,
        payloadHash,
        operation: transaction.operation,
        amount: transaction.amount.toDecimalString(),
        currency: transaction.amount.currency,
        status: transaction.status,
        referenceTransactionId: transaction.referenceTransactionId,
        failureCode: transaction.failureCode,

        referenceAttempts: 0,
        nextReferenceCheckAt: isPendingReference
          ? new Date(now.getTime() + 5_000)
          : null,
        referenceExpiresAt: isPendingReference
          ? new Date(now.getTime() + 15 * 60 * 1_000)
          : null,

        createdAt: now,
        updatedAt: now,
      });

      // Primeiro persiste a transação de aposta.
      // Ela precisa existir antes do lançamento no ledger.
      tx.persist(wagerEntity);
      await tx.flush();

      // Agora podemos persistir as alterações financeiras.
      if (ledgerData) {
        walletEntity.balance = wallet.balance.toDecimalString();
        walletEntity.updatedAt = now;

        const ledgerEntity = tx.create(WalletLedgerEntity, {
          id: randomUUID(),
          walletId: walletEntity.id,
          wagerTransactionId: transaction.id,
          amount: transaction.amount.toDecimalString(),
          currency: transaction.amount.currency,
          direction: ledgerData.direction,
          reason: ledgerData.reason,
          reversalOfEntryId: ledgerData.reversalOfEntryId,
          createdAt: now,
        });

        tx.persist([walletEntity, ledgerEntity]);
      }

      // Evento de outbox continua na mesma transação SQL.
      const outboxEntity = tx.create(OutboxEventEntity, {
        id: randomUUID(),
        eventType: `WAGER_${transaction.status}`,
        payload: {
          transactionId: transaction.id,
          providerId: transaction.providerId,
          playerId: transaction.playerId,
          operation: transaction.operation,
          status: transaction.status,
        },
        status: 'PENDING',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });

      tx.persist(outboxEntity);
      await tx.flush();

      return transaction;
    });
  }
  async processPendingReferences(): Promise<number> {
    const batchSize = 20;
    let processedCount = 0;

    for (let i = 0; i < batchSize; i++) {
      const processed = await this.em.transactional(async (tx) => {
        // Seleciona uma pendência e reserva a linha exclusivamente.
        // Outra instância não conseguirá selecionar a mesma linha.
        const rows = (await tx.getConnection().execute(`
        SELECT id
        FROM wager_transactions
        WHERE status = 'PENDING_REFERENCE'
          AND next_reference_check_at <= now()
        ORDER BY next_reference_check_at ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `)) as Array<{ id: string }>;

        if (rows.length === 0) {
          return false;
        }

        const pendingEntity = await tx.findOne(WagerTransactionEntity, {
          id: rows[0].id,
        });

        if (!pendingEntity) {
          return true;
        }

        const now = new Date();

        const transaction = WagerTransaction.restore({
          id: pendingEntity.id,
          providerId: pendingEntity.providerId,
          playerId: pendingEntity.playerId,
          walletId: pendingEntity.walletId,
          roundId: pendingEntity.roundId,
          operation: pendingEntity.operation,
          amount: Money.from(pendingEntity.amount, pendingEntity.currency),
          referenceTransactionId: pendingEntity.referenceTransactionId,
          status: pendingEntity.status,
          failureCode: pendingEntity.failureCode,
        });

        // A carteira é bloqueada antes de qualquer alteração financeira.
        const walletEntity = await tx.findOne(
          WalletEntity,
          { id: pendingEntity.walletId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );

        let ledgerData: ReversalLedgerData | null = null;
        let referenceMissing = false;

        if (!walletEntity) {
          transaction.fail('WALLET_NOT_FOUND');
        } else if (
          walletEntity.playerId !== pendingEntity.playerId ||
          walletEntity.currency !== pendingEntity.currency
        ) {
          transaction.reject('INVALID_WALLET');
        } else {
          const wallet = Wallet.restore(
            walletEntity.id,
            walletEntity.playerId,
            walletEntity.currency,
            walletEntity.balance,
          );

          const result = await this.applyReversal(tx, transaction, wallet);

          ledgerData = result.ledgerData;
          referenceMissing = result.referenceMissing;

          // A referência apareceu e passou pelas validações.
          if (!referenceMissing && transaction.status === 'PENDING_REFERENCE') {
            transaction.markProcessed();
          }

          // A carteira só é modificada quando existe lançamento financeiro.
          if (ledgerData) {
            walletEntity.balance = wallet.balance.toDecimalString();
            walletEntity.updatedAt = now;
          }
        }

        // Cada consulta efetiva conta como uma tentativa.
        pendingEntity.referenceAttempts += 1;

        const expiresAt =
          pendingEntity.referenceExpiresAt ??
          new Date(now.getTime() + 15 * 60 * 1_000);

        pendingEntity.referenceExpiresAt = expiresAt;

        if (referenceMissing) {
          if (
            pendingEntity.referenceAttempts >= 8 ||
            now.getTime() >= expiresAt.getTime()
          ) {
            transaction.reject('REFERENCE_NOT_FOUND');
          } else {
            // Backoff exponencial: 10s, 20s, 40s, 80s...
            // Máximo de 5 minutos entre verificações.
            const delayMs = Math.min(
              5_000 * 2 ** pendingEntity.referenceAttempts,
              5 * 60 * 1_000,
            );

            // Não agenda a próxima tentativa para depois da expiração.
            const remainingMs = Math.max(
              0,
              expiresAt.getTime() - now.getTime(),
            );

            pendingEntity.nextReferenceCheckAt = new Date(
              now.getTime() + Math.min(delayMs, remainingMs),
            );
          }
        }

        // Atualiza o estado persistido da transação.
        pendingEntity.status = transaction.status;
        pendingEntity.failureCode = transaction.failureCode;
        pendingEntity.updatedAt = now;

        const isTerminal =
          transaction.status === 'PROCESSED' ||
          transaction.status === 'REJECTED' ||
          transaction.status === 'FAILED';

        if (isTerminal) {
          pendingEntity.nextReferenceCheckAt = null;
        }

        // Cria o lançamento financeiro, se houve reversão bem-sucedida.
        if (ledgerData && walletEntity) {
          const ledgerEntity = tx.create(WalletLedgerEntity, {
            id: randomUUID(),
            walletId: walletEntity.id,
            wagerTransactionId: pendingEntity.id,
            amount: pendingEntity.amount,
            currency: pendingEntity.currency,
            direction: ledgerData.direction,
            reason: ledgerData.reason,
            reversalOfEntryId: ledgerData.reversalOfEntryId,
            createdAt: now,
          });

          tx.persist([walletEntity, ledgerEntity]);
        }

        // Só publica novo evento quando a transação termina.
        // As tentativas intermediárias não geram eventos repetidos.
        if (isTerminal) {
          const outboxEntity = tx.create(OutboxEventEntity, {
            id: randomUUID(),
            eventType: `WAGER_${transaction.status}`,
            payload: {
              transactionId: transaction.id,
              providerId: transaction.providerId,
              playerId: transaction.playerId,
              operation: transaction.operation,
              status: transaction.status,
            },
            status: 'PENDING',
            attempts: 0,
            createdAt: now,
            updatedAt: now,
          });

          tx.persist(outboxEntity);
        }

        await tx.flush();

        return true;
      });

      if (!processed) {
        break;
      }

      processedCount++;
    }

    return processedCount;
  }
}

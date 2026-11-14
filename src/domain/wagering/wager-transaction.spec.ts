import { describe, expect, it } from 'vitest';
import { Money } from '../shared/money/money.js';
import { WagerTransaction } from './wager-transaction.js';

describe('WagerTransaction', () => {
  const base = {
    id: 'wager-1',
    providerId: 'provider-1',
    playerId: 'player-1',
    walletId: 'wallet-1',
    roundId: 'round-1',
    operation: 'BET' as const,
    amount: Money.from('50.00', 'BRL'),
  };

  it('should create a pending transaction', () => {
    const transaction = WagerTransaction.create(base);

    expect(transaction.status).toBe('PENDING');
  });

  it('should mark a transaction as processed', () => {
    const transaction = WagerTransaction.create(base);

    transaction.markProcessed();

    expect(transaction.status).toBe('PROCESSED');
  });

  it('should mark a transaction as pending reference', () => {
    const transaction = WagerTransaction.create(base);

    transaction.markPendingReference();

    expect(transaction.status).toBe('PENDING_REFERENCE');
  });

  it('should reject a transaction with a failure code', () => {
    const transaction = WagerTransaction.create(base);

    transaction.reject('INSUFFICIENT_FUNDS');

    expect(transaction.status).toBe('REJECTED');
    expect(transaction.failureCode).toBe('INSUFFICIENT_FUNDS');
  });

  it('should not allow processing a terminal transaction twice', () => {
    const transaction = WagerTransaction.create(base);

    transaction.markProcessed();

    expect(() => transaction.markProcessed()).toThrow(
      'Transaction is already terminal',
    );
  });

  it('should require a reference for refunds', () => {
    expect(() =>
      WagerTransaction.create({
        ...base,
        operation: 'REFUND',
      }),
    ).toThrow('Reference transaction is required');
  });

  it('should allow a refund with a reference', () => {
    const transaction = WagerTransaction.create({
      ...base,
      operation: 'REFUND',
      referenceTransactionId: 'wager-original',
    });

    expect(transaction.referenceTransactionId).toBe('wager-original');
  });

  it('should reject zero amounts', () => {
    expect(() =>
      WagerTransaction.create({
        ...base,
        amount: Money.from('0.00', 'BRL'),
      }),
    ).toThrow('Transaction amount must be positive');
  });

  it('should not allow failure after processing', () => {
    const transaction = WagerTransaction.create(base);

    transaction.markProcessed();

    expect(() => transaction.fail('SOME_ERROR')).toThrow(
      'Transaction is already terminal',
    );
  });
});

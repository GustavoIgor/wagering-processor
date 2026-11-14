import { describe, expect, it } from 'vitest';
import { Money } from '../shared/money/money.js';
import { WalletLedgerEntry } from './wallet-ledger-entry.js';

describe('WalletLedgerEntry', () => {
  const base = {
    id: 'ledger-1',
    walletId: 'wallet-1',
    wagerTransactionId: 'wager-1',
    amount: Money.from('50.00', 'BRL'),
  };

  it('should create a BET debit entry', () => {
    const entry = WalletLedgerEntry.create({
      ...base,
      direction: 'DEBIT',
      reason: 'BET',
    });

    expect(entry.reason).toBe('BET');
    expect(entry.direction).toBe('DEBIT');
  });

  it('should create a WIN credit entry', () => {
    const entry = WalletLedgerEntry.create({
      ...base,
      direction: 'CREDIT',
      reason: 'WIN',
    });

    expect(entry.direction).toBe('CREDIT');
  });

  it('should reject BET as credit', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...base,
        direction: 'CREDIT',
        reason: 'BET',
      }),
    ).toThrow('BET must be a debit');
  });

  it('should reject zero amounts', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...base,
        amount: Money.from('0.00', 'BRL'),
        direction: 'DEBIT',
        reason: 'BET',
      }),
    ).toThrow('Ledger amount must be positive');
  });

  it('should require an original entry for refunds', () => {
    expect(() =>
      WalletLedgerEntry.create({
        ...base,
        direction: 'CREDIT',
        reason: 'REFUND',
      }),
    ).toThrow('Reversal must reference an original ledger entry');
  });

  it('should create a refund referencing the original entry', () => {
    const entry = WalletLedgerEntry.create({
      ...base,
      direction: 'CREDIT',
      reason: 'REFUND',
      reversalOfEntryId: 'ledger-original',
    });

    expect(entry.reversalOfEntryId).toBe('ledger-original');
  });
});

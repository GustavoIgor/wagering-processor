import { Money } from '../shared/money/money.js';

export type LedgerDirection = 'DEBIT' | 'CREDIT';

export type LedgerReason = 'BET' | 'WIN' | 'REFUND' | 'ROLLBACK';

interface CreateLedgerEntry {
  id: string;
  walletId: string;
  wagerTransactionId: string;
  amount: Money;
  direction: LedgerDirection;
  reason: LedgerReason;
  reversalOfEntryId?: string;
}

export class WalletLedgerEntry {
  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly wagerTransactionId: string,
    public readonly amount: Money,
    public readonly direction: LedgerDirection,
    public readonly reason: LedgerReason,
    public readonly reversalOfEntryId: string | null,
    public readonly createdAt: string,
  ) {}

  static create(data: CreateLedgerEntry): WalletLedgerEntry {
    if (!data.id || !data.walletId || !data.wagerTransactionId) {
      throw new Error('Ledger identifiers are required');
    }

    if (data.amount.isNegative() || data.amount.isZero()) {
      throw new Error('Ledger amount must be positive');
    }

    if (data.reason === 'BET' && data.direction !== 'DEBIT') {
      throw new Error('BET must be a debit');
    }

    if (data.reason === 'WIN' && data.direction !== 'CREDIT') {
      throw new Error('WIN must be a credit');
    }

    if (data.reason === 'REFUND' && data.direction !== 'CREDIT') {
      throw new Error('REFUND must be a credit');
    }

    if (
      (data.reason === 'REFUND' || data.reason === 'ROLLBACK') &&
      !data.reversalOfEntryId
    ) {
      throw new Error('Reversal must reference an original ledger entry');
    }

    return new WalletLedgerEntry(
      data.id,
      data.walletId,
      data.wagerTransactionId,
      data.amount,
      data.direction,
      data.reason,
      data.reversalOfEntryId ?? null,
      new Date().toISOString(),
    );
  }
}

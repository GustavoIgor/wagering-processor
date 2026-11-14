import { Money } from '../shared/money/money.js';

export type WagerOperation = 'BET' | 'WIN' | 'LOSS' | 'REFUND' | 'ROLLBACK';

export type WagerStatus =
  'PENDING' | 'PENDING_REFERENCE' | 'PROCESSED' | 'REJECTED' | 'FAILED';

interface CreateWagerTransaction {
  id: string;
  providerId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  operation: WagerOperation;
  amount: Money;
  referenceTransactionId?: string;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly playerId: string,
    public readonly walletId: string,
    public readonly roundId: string,
    public readonly operation: WagerOperation,
    public readonly amount: Money,
    public readonly referenceTransactionId: string | null,
    private currentStatus: WagerStatus,
    private currentFailureCode: string | null,
  ) {}

  static create(data: CreateWagerTransaction): WagerTransaction {
    if (
      !data.id ||
      !data.providerId ||
      !data.playerId ||
      !data.walletId ||
      !data.roundId
    ) {
      throw new Error('Transaction identifiers are required');
    }

    if (data.amount.isNegative() || data.amount.isZero()) {
      throw new Error('Transaction amount must be positive');
    }

    if (
      (data.operation === 'REFUND' || data.operation === 'ROLLBACK') &&
      !data.referenceTransactionId
    ) {
      throw new Error('Reference transaction is required');
    }

    return new WagerTransaction(
      data.id,
      data.providerId,
      data.playerId,
      data.walletId,
      data.roundId,
      data.operation,
      data.amount,
      data.referenceTransactionId ?? null,
      'PENDING',
      null,
    );
  }

  get status(): WagerStatus {
    return this.currentStatus;
  }

  get failureCode(): string | null {
    return this.currentFailureCode;
  }

  markPendingReference(): void {
    this.ensurePending();

    this.currentStatus = 'PENDING_REFERENCE';
  }

  markProcessed(): void {
    this.ensureNotTerminal();

    this.currentStatus = 'PROCESSED';
  }

  reject(failureCode: string): void {
    this.ensureNotTerminal();

    this.currentStatus = 'REJECTED';
    this.currentFailureCode = failureCode;
  }

  fail(failureCode: string): void {
    this.ensureNotTerminal();

    this.currentStatus = 'FAILED';
    this.currentFailureCode = failureCode;
  }

  private ensurePending(): void {
    if (this.currentStatus !== 'PENDING') {
      throw new Error('Transaction is not pending');
    }
  }

  private ensureNotTerminal(): void {
    if (
      this.currentStatus === 'PROCESSED' ||
      this.currentStatus === 'REJECTED' ||
      this.currentStatus === 'FAILED'
    ) {
      throw new Error('Transaction is already terminal');
    }
  }
}

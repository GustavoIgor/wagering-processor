import { WagerTransaction } from '../../domain/wagering/wager-transaction.js';

export const WAGERING_REPOSITORY = Symbol('WAGERING_REPOSITORY');

export interface WageringRepository {
  process(
    transaction: WagerTransaction,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<WagerTransaction>;

  processPendingReferences(): Promise<number>;
}

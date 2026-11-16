import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Unique({ properties: ['providerId', 'idempotencyKey'] })
@Entity({ tableName: 'wager_transactions' })
@Index({ properties: ['providerId', 'playerId', 'roundId'] })
@Index({ properties: ['status', 'createdAt'] })
@Index({ properties: ['status', 'nextReferenceCheckAt'] })
export class WagerTransactionEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ length: 128 })
  providerId!: string;

  @Property({ length: 128 })
  playerId!: string;

  @Property({ type: 'uuid' })
  walletId!: string;

  @Property({ length: 128 })
  roundId!: string;

  @Property({ length: 128 })
  idempotencyKey!: string;

  @Property({ length: 64 })
  payloadHash!: string;

  @Property({ length: 20 })
  operation!: 'BET' | 'WIN' | 'LOSS' | 'REFUND' | 'ROLLBACK';

  @Property({ columnType: 'numeric(20,2)' })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ length: 30, default: 'PENDING' })
  status!:
    'PENDING' | 'PENDING_REFERENCE' | 'PROCESSED' | 'REJECTED' | 'FAILED';

  @Property({ length: 128, nullable: true })
  referenceTransactionId: string | null = null;

  @Property({ length: 100, nullable: true })
  failureCode: string | null = null;

  @Property({ type: 'integer', default: 0 })
  referenceAttempts = 0;

  @Property({ nullable: true })
  nextReferenceCheckAt: Date | null = null;

  @Property({ nullable: true })
  referenceExpiresAt: Date | null = null;

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}

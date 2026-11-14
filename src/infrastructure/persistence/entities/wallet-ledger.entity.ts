import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'wallet_ledger_entries' })
@Unique({ properties: ['wagerTransactionId'] })
@Unique({ properties: ['reversalOfEntryId'] })
export class WalletLedgerEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid' })
  walletId!: string;

  @Property({ type: 'uuid' })
  wagerTransactionId!: string;

  @Property({
    columnType: 'numeric(20,2)',
  })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ length: 10 })
  direction!: 'DEBIT' | 'CREDIT';

  @Property({ length: 20 })
  reason!: 'BET' | 'WIN' | 'REFUND' | 'ROLLBACK';

  @Property({ type: 'uuid', nullable: true })
  reversalOfEntryId: string | null = null;

  @Property()
  createdAt: Date = new Date();
}

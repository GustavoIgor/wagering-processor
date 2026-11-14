import { Migration } from '@mikro-orm/migrations';

export class Migration20261114020250 extends Migration {
  override name = 'Migration20261114020250';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "inbox_messages" ("id" uuid not null, "consumer_name" varchar(100) not null, "message_id" varchar(128) not null, "processed_at" timestamptz not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "inbox_messages_created_at_index" on "inbox_messages" ("created_at");`,
    );
    this.addSql(
      `alter table "inbox_messages" add constraint "inbox_messages_consumer_name_message_id_unique" unique ("consumer_name", "message_id");`,
    );

    this.addSql(
      `create table "outbox_events" ("id" uuid not null, "event_type" varchar(100) not null, "payload" jsonb not null, "status" varchar(20) not null default 'PENDING', "attempts" int not null default 0, "published_at" timestamptz null, "next_attempt_at" timestamptz null, "last_error" varchar(1000) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "locked_by" varchar(128) null, "locked_until" timestamptz null, primary key ("id"));`,
    );
    this.addSql(
      `create index "outbox_events_status_created_at_index" on "outbox_events" ("status", "created_at");`,
    );

    this.addSql(
      `create table "wager_transactions" ("id" uuid not null, "provider_id" varchar(128) not null, "player_id" varchar(128) not null, "wallet_id" uuid not null, "round_id" varchar(128) not null, "idempotency_key" varchar(128) not null, "payload_hash" varchar(64) not null, "operation" varchar(20) not null, "amount" numeric(20,2) not null, "currency" varchar(3) not null, "status" varchar(30) not null default 'PENDING', "reference_transaction_id" varchar(128) null, "failure_code" varchar(100) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "wager_transactions_status_created_at_index" on "wager_transactions" ("status", "created_at");`,
    );
    this.addSql(
      `create index "wager_transactions_provider_id_player_id_round_id_index" on "wager_transactions" ("provider_id", "player_id", "round_id");`,
    );
    this.addSql(
      `alter table "wager_transactions" add constraint "wager_transactions_provider_id_idempotency_key_unique" unique ("provider_id", "idempotency_key");`,
    );

    this.addSql(
      `create table "wallets" ("id" uuid not null, "player_id" varchar(128) not null, "currency" varchar(3) not null, "balance" numeric(20,2) not null default '0.00', "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "wallets" add constraint "wallets_player_id_currency_unique" unique ("player_id", "currency");`,
    );

    this.addSql(
      `create table "wallet_ledger_entries" ("id" uuid not null, "wallet_id" uuid not null, "wager_transaction_id" uuid not null, "amount" numeric(20,2) not null, "currency" varchar(3) not null, "direction" varchar(10) not null, "reason" varchar(20) not null, "reversal_of_entry_id" uuid null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_reversal_of_entry_id_unique" unique ("reversal_of_entry_id");`,
    );
    this.addSql(
      `alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wager_transaction_id_unique" unique ("wager_transaction_id");`,
    );
    // Wallet constraints
    this.addSql(`
  alter table "wallets"
  add constraint "wallets_balance_non_negative"
  check ("balance" >= 0);
`);

    this.addSql(`
  alter table "wallets"
  add constraint "wallets_id_currency_unique"
  unique ("id", "currency");
`);

    // Wager transaction constraints
    this.addSql(`
  alter table "wager_transactions"
  add constraint "wager_transactions_amount_positive"
  check ("amount" > 0);
`);

    this.addSql(`
  alter table "wager_transactions"
  add constraint "wager_transactions_operation_valid"
  check ("operation" in ('BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));
`);

    this.addSql(`
  alter table "wager_transactions"
  add constraint "wager_transactions_status_valid"
  check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));
`);

    this.addSql(`
  alter table "wager_transactions"
  add constraint "wager_transactions_currency_valid"
  check ("currency" ~ '^[A-Z]{3}$');
`);

    this.addSql(`
  alter table "wager_transactions"
  add constraint "wager_transactions_id_wallet_currency_unique"
  unique ("id", "wallet_id", "currency");
`);

    this.addSql(`
  alter table "wager_transactions"
  add constraint "wager_transactions_wallet_currency_fk"
  foreign key ("wallet_id", "currency")
  references "wallets" ("id", "currency");
`);

    // Ledger constraints
    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_amount_positive"
  check ("amount" > 0);
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_direction_valid"
  check ("direction" in ('DEBIT', 'CREDIT'));
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_reason_valid"
  check ("reason" in ('BET', 'WIN', 'REFUND', 'ROLLBACK'));
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_direction_reason_valid"
  check (
    ("reason" = 'BET' and "direction" = 'DEBIT')
    or ("reason" in ('WIN', 'REFUND') and "direction" = 'CREDIT')
    or "reason" = 'ROLLBACK'
  );
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_reversal_required"
  check (
    ("reason" in ('REFUND', 'ROLLBACK') and "reversal_of_entry_id" is not null)
    or ("reason" in ('BET', 'WIN') and "reversal_of_entry_id" is null)
  );
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_currency_valid"
  check ("currency" ~ '^[A-Z]{3}$');
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_id_wallet_currency_unique"
  unique ("id", "wallet_id", "currency");
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_wallet_currency_fk"
  foreign key ("wallet_id", "currency")
  references "wallets" ("id", "currency");
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_wager_wallet_currency_fk"
  foreign key ("wager_transaction_id", "wallet_id", "currency")
  references "wager_transactions" ("id", "wallet_id", "currency");
`);

    this.addSql(`
  alter table "wallet_ledger_entries"
  add constraint "ledger_reversal_same_wallet_currency_fk"
  foreign key ("reversal_of_entry_id", "wallet_id", "currency")
  references "wallet_ledger_entries" ("id", "wallet_id", "currency");
`);

    // Outbox constraints
    this.addSql(`
  alter table "outbox_events"
  add constraint "outbox_attempts_non_negative"
  check ("attempts" >= 0);
`);

    this.addSql(`
  alter table "outbox_events"
  add constraint "outbox_status_valid"
  check ("status" in ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED'));
`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "inbox_messages" cascade;`);
    this.addSql(`drop table if exists "outbox_events" cascade;`);
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
    this.addSql(`drop table if exists "wallets" cascade;`);
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
  }
}

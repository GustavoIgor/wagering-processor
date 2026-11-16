import { Migration } from '@mikro-orm/migrations';

export class Migration20261116002544_add_pending_reference_fields extends Migration {
  override name = 'Migration20261116002544_add_pending_reference_fields';

  override up(): void {
    this.addSql(`
      alter table "wager_transactions"
      add column "reference_attempts" integer not null default 0,
      add column "next_reference_check_at" timestamptz null,
      add column "reference_expires_at" timestamptz null;
    `);

    // Registros PENDING_REFERENCE existentes também precisam
    // entrar no ciclo de recuperação.
    this.addSql(`
      update "wager_transactions"
      set
        "next_reference_check_at" = now(),
        "reference_expires_at" = now() + interval '15 minutes'
      where "status" = 'PENDING_REFERENCE';
    `);

    this.addSql(`
      create index "wager_transactions_status_next_reference_check_at_index"
      on "wager_transactions" ("status", "next_reference_check_at");
    `);
  }

  override down(): void {
    this.addSql(`
      drop index if exists
      "wager_transactions_status_next_reference_check_at_index";
    `);

    this.addSql(`
      alter table "wager_transactions"
      drop column "reference_attempts",
      drop column "next_reference_check_at",
      drop column "reference_expires_at";
    `);
  }
}

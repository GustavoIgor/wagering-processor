import { Migration } from '@mikro-orm/migrations';

export class Migration20261115170000_add_ledger_immutability_trigger extends Migration {
  override name = 'Migration20261115170000_add_ledger_immutability_trigger';

  override up(): void {
    this.addSql(`
      create or replace function prevent_wallet_ledger_mutation()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'Wallet ledger entries are immutable';
      end;
      $$;
    `);

    this.addSql(`
      drop trigger if exists wallet_ledger_entries_immutable
      on wallet_ledger_entries;
    `);

    this.addSql(`
      create trigger wallet_ledger_entries_immutable
      before update or delete
      on wallet_ledger_entries
      for each row
      execute function prevent_wallet_ledger_mutation();
    `);
  }

  override down(): void {
    this.addSql(`
      drop trigger if exists wallet_ledger_entries_immutable
      on wallet_ledger_entries;
    `);

    this.addSql(`
      drop function if exists prevent_wallet_ledger_mutation();
    `);
  }
}

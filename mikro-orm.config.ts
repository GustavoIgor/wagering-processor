import 'dotenv/config';

import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { WalletEntity } from './src/infrastructure/persistence/entities/wallet.entity.js';
import { WalletLedgerEntity } from './src/infrastructure/persistence/entities/wallet-ledger.entity.js';
import { WagerTransactionEntity } from './src/infrastructure/persistence/entities/wager-transaction.entity.js';
import { InboxMessageEntity } from './src/infrastructure/persistence/entities/inbox-message.entity.js';
import { OutboxEventEntity } from './src/infrastructure/persistence/entities/outbox-event.entity.js';

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export default defineConfig({
  host: '127.0.0.1',
  port: 5432,

  dbName: requiredEnv('POSTGRES_DB'),
  user: requiredEnv('POSTGRES_USER'),
  password: requiredEnv('POSTGRES_PASSWORD'),

  metadataProvider: TsMorphMetadataProvider,

  entities: [
    WalletEntity,
    WalletLedgerEntity,
    WagerTransactionEntity,
    InboxMessageEntity,
    OutboxEventEntity,
  ],
  extensions: [Migrator],

  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    emit: 'ts',
    transactional: true,
    allOrNothing: true,
  },
});

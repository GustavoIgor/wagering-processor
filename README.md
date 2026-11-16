# Distributed Wagering Processor

A distributed wagering transaction processor built with **NestJS, TypeScript, Bun, PostgreSQL, MikroORM, and SQS-compatible messaging through MiniStack**.

The application exposes HTTP endpoints for wallet management and wagering operations. It uses PostgreSQL as the source of truth for balances, transaction idempotency, the financial ledger, message inbox, and transactional outbox.

## Contents

- [Architecture](#architecture)
- [Technical decisions](#technical-decisions)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Database migrations](#database-migrations)
- [SQS queues](#sqs-queues)
- [Running the application](#running-the-application)
- [API](#api)
- [Wagering behavior](#wagering-behavior)
- [Reliability and consistency](#reliability-and-consistency)
- [Tests and verification](#tests-and-verification)
- [Known limitations and scope](#known-limitations-and-scope)

## Architecture

The project follows a layered structure:

- **Domain** — money, wallets, ledger entries, and wagering transaction state.
- **Application** — use cases and repository ports.
- **Infrastructure** — NestJS controllers, MikroORM entities and repositories, PostgreSQL persistence, SQS publisher/consumer.
- **Migrations** — versioned PostgreSQL schema changes.

Main data flow:

1. An HTTP request reaches the NestJS application.
2. The application validates and processes the wagering operation.
3. A PostgreSQL transaction locks the relevant wallet and persists the transaction, balance change, ledger entry, and outbox event atomically.
4. The outbox publisher sends committed events to the SQS FIFO queue.
5. The consumer records received message IDs in the inbox to prevent duplicate processing of the same message.

PostgreSQL is the source of truth. SQS is used for asynchronous event delivery, not as the authoritative financial store.

## Technical decisions

### Exact monetary arithmetic

Money is represented as decimal strings at system boundaries and handled with `decimal.js` in the domain layer. PostgreSQL stores monetary values using `NUMERIC(20,2)`.

JavaScript `number` floating-point arithmetic is not used for monetary calculations. `Money` is an immutable value object that validates currency and decimal precision and provides exact arithmetic operations.

### Wallet concurrency and non-negative balances

Wallet updates are performed inside PostgreSQL transactions using pessimistic row-level locking. This serializes competing balance changes for the same wallet across independent application processes.

The database also enforces a non-negative wallet balance constraint. Application-level checks and database constraints provide complementary protection.

### Persistent idempotency

Wager requests require an `Idempotency-Key` header. The provider ID and idempotency key are persisted with the transaction, and a payload hash is stored to detect key reuse with a different request body.

- Same provider, key, and payload: return the previously persisted transaction.
- Same provider and key but different payload: return HTTP `409 Conflict`.

Idempotency is database-backed and therefore shared by all application instances.

### Auditable ledger

Every successful balance-changing operation creates a corresponding ledger entry in the same database transaction as the wallet update.

The ledger records the wallet, wagering transaction, amount, currency, direction, reason, and (for reversals) the entry being reversed. Database constraints protect relationships and uniqueness. An immutability trigger prevents ledger entries from being changed after insertion.

`LOSS` does not change the wallet balance and therefore does not create a financial ledger entry.

### Transactional outbox and inbox

The outbox event is inserted in the same PostgreSQL transaction as the wagering result. The publisher only sees committed outbox records and publishes them asynchronously afterward. This avoids publishing an event for a transaction that later rolls back.

The publisher claims pending records with PostgreSQL row locking and `SKIP LOCKED`, allowing multiple publisher instances to work concurrently. Failed sends can be retried.

The consumer stores `(consumerName, messageId)` in the inbox with conflict-safe insertion. It acknowledges the SQS message only after the inbox transaction commits. This makes redelivery safe for inbox recording.

### Reversals and missing references

`REFUND` and `ROLLBACK` operations validate their referenced transaction and ledger entry, including provider, player, wallet, currency, round, amount, and reversal eligibility. A reversal is limited to one successful reversal per ledger entry.

When a referenced transaction is not found, the request can remain in `PENDING_REFERENCE`. The pending-reference processor periodically retries eligible records, using persisted attempt and scheduling fields, exponential backoff, and an expiry window. A reference that remains unavailable is eventually rejected.

## Requirements

- Bun (the project was developed with Bun 1.4.x)
- Docker Engine and Docker Compose
- Node.js compatible with the installed NestJS toolchain (Node.js 26 was used during development)
- AWS CLI, or another SQS client, if you need to create or inspect queues manually

## Local setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

In PowerShell:

```powershell
Copy-Item .env.example .env
```

Example `.env.example`:

```dotenv
POSTGRES_DB=wagering_db
POSTGRES_USER=wagering_user
POSTGRES_PASSWORD=change_me

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

SQS_ENDPOINT=http://localhost:4566
SQS_WAGERING_QUEUE_URL=http://localhost:4566/000000000000/wagering-events.fifo
SQS_WAGERING_DLQ_URL=http://localhost:4566/000000000000/wagering-events-dlq.fifo
```

These credentials are local development credentials for MiniStack. Do not use them with AWS or commit a real `.env` file.

### 3. Start PostgreSQL and MiniStack

```bash
docker compose up -d
```

Check container status:

```bash
docker compose ps
```

PostgreSQL is exposed on `127.0.0.1:5432`; MiniStack is exposed on `127.0.0.1:4566`.

The Compose file starts the services and persists their data in Docker volumes. It does **not** itself create the SQS queues; create the FIFO queues before running the application (see [SQS queues](#sqs-queues)).

## Database migrations

Apply pending migrations:

```bash
bunx mikro-orm migration:up --config ./mikro-orm.config.ts
```

Create a new migration after changing the mapped schema:

```bash
bunx mikro-orm migration:create --config ./mikro-orm.config.ts --name=describe-your-change
```

Review generated SQL before applying it. In particular, preserve manually maintained database constraints and the ledger immutability trigger. Do not edit a migration that has already been applied to a shared database; create a new migration instead.

To roll back the most recently applied migration:

```bash
bunx mikro-orm migration:down --config ./mikro-orm.config.ts
```

## SQS queues

The application is configured to use these FIFO queues:

- `wagering-events.fifo`
- `wagering-events-dlq.fifo`

The corresponding URLs are configured through `SQS_WAGERING_QUEUE_URL` and `SQS_WAGERING_DLQ_URL`.

Create the dead-letter queue first, then create the main queue with a redrive policy pointing to the DLQ. For example, with AWS CLI and MiniStack:

```bash
aws --endpoint-url=http://localhost:4566 \
  sqs create-queue \
  --queue-name wagering-events-dlq.fifo \
  --attributes FifoQueue=true
```

Retrieve the DLQ ARN:

```bash
aws --endpoint-url=http://localhost:4566 \
  sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/wagering-events-dlq.fifo \
  --attribute-names QueueArn
```

Use that ARN in the main queue's `RedrivePolicy`:

```bash
aws --endpoint-url=http://localhost:4566 \
  sqs create-queue \
  --queue-name wagering-events.fifo \
  --attributes FifoQueue=true,ContentBasedDeduplication=false,RedrivePolicy='{"deadLetterTargetArn":"<DLQ_ARN>","maxReceiveCount":"5"}'
```

Replace `<DLQ_ARN>` with the ARN returned by the previous command. If the queues already exist in the persistent MiniStack volume, they do not need to be recreated.

## Running the application

Start the development server:

```bash
bun run start:dev
```

By default, the application listens on port `3000`. The port can be changed with `PORT`.

### Running multiple instances

Open separate terminals and run the following commands from the project directory:

```powershell
$env:PORT=3000
bun.cmd run start:dev
```

```powershell
$env:PORT=3001
bun.cmd run start:dev
```

```powershell
$env:PORT=3002
bun.cmd run start:dev
```

All instances must use the same PostgreSQL database and SQS configuration. Database locks and persistent idempotency coordinate work across processes.

## API

The API currently exposes the following routes.

### `GET /`

Returns the application greeting.

### `POST /wallets`

Creates a wallet for a player and currency.

Request:

```json
{
  "playerId": "player-123",
  "currency": "BRL"
}
```

Example response:

```json
{
  "id": "wallet-uuid",
  "playerId": "player-123",
  "currency": "BRL",
  "balance": "0.00"
}
```

A wallet is unique per `(playerId, currency)`. Creating a duplicate wallet returns `409 Conflict`.

### `GET /wallets/:id`

Returns a wallet and its current balance. Returns `404 Not Found` if the wallet does not exist.

### `POST /wagers`

Submits a wagering operation. The `Idempotency-Key` header is required.

Request:

```http
POST /wagers
Content-Type: application/json
Idempotency-Key: provider-request-0001
```

```json
{
  "providerId": "provider-1",
  "playerId": "player-123",
  "walletId": "wallet-uuid",
  "roundId": "round-456",
  "operation": "BET",
  "amount": "10.00",
  "currency": "BRL"
}
```

Supported operations:

- `BET`
- `WIN`
- `LOSS`
- `REFUND`
- `ROLLBACK`

`REFUND` and `ROLLBACK` require `referenceTransactionId`:

```json
{
  "providerId": "provider-1",
  "playerId": "player-123",
  "walletId": "wallet-uuid",
  "roundId": "round-456",
  "operation": "REFUND",
  "amount": "10.00",
  "currency": "BRL",
  "referenceTransactionId": "original-wager-uuid"
}
```

The response includes the transaction ID, operation, amount, currency, status, and failure code (if any).

## Wagering behavior

| Operation  | Wallet effect                                           | Ledger effect                         |
| ---------- | ------------------------------------------------------- | ------------------------------------- |
| `BET`      | Debit                                                   | `DEBIT / BET`                         |
| `WIN`      | Credit                                                  | `CREDIT / WIN`                        |
| `LOSS`     | No balance change                                       | No entry                              |
| `REFUND`   | Reverse the referenced eligible `BET`                   | Opposite direction, reason `REFUND`   |
| `ROLLBACK` | Reverse the referenced eligible ledger-backed operation | Opposite direction, reason `ROLLBACK` |

A transaction can have one of these statuses:

- `PENDING`
- `PENDING_REFERENCE`
- `PROCESSED`
- `REJECTED`
- `FAILED`

`PROCESSED`, `REJECTED`, and `FAILED` are terminal states.

Insufficient funds reject a debit rather than allowing a negative balance. Reversal failures use a distinct failure code when the wallet cannot cover the reversal.

## Reliability and consistency

The implementation uses several complementary safeguards:

- PostgreSQL transactions for atomic persistence.
- Pessimistic wallet row locks for concurrent balance updates.
- A database constraint preventing negative wallet balances.
- Persistent idempotency keys and payload hashes.
- Unique constraints for wallet identity, wager idempotency, ledger-to-wager relationships, and reversal references.
- An immutable financial ledger.
- Transactional outbox publication after commit.
- Inbox deduplication and acknowledgement after commit.
- FIFO queues and a dead-letter queue for asynchronous delivery.

The wallet balance can be reconciled against the ledger by summing credits and subtracting debits for each wallet.

## Tests and verification

Run the automated test suite:

```bash
bun test
```

Build the application:

```bash
bun run build
```

Run the end-to-end test suite:

```bash
bun run test:e2e
```

The project also includes watch and coverage scripts:

```bash
bun run test:watch
bun run test:cov
```

### Manual multi-instance concurrency verification

A manual concurrency test was executed against **three simultaneously running NestJS instances** (ports `3000`, `3001`, and `3002`) sharing the same PostgreSQL database.

Test scenario:

- Initial wallet balance: `10.00`
- Ten concurrent `BET` requests
- Stake per request: `2.00`
- Requests distributed across all three application instances

Observed result:

| Outcome                                | Result |
| -------------------------------------- | -----: |
| Processed wagers                       |      5 |
| Rejected wagers (`INSUFFICIENT_FUNDS`) |      5 |
| HTTP 5xx / connection errors           |      0 |
| Final wallet balance                   | `0.00` |

A subsequent ledger reconciliation for that wallet returned:

- Wallet balance: `0.00`
- Ledger-derived balance: `0.00`
- Reconciled: `true`

This is a manual integration verification, not a substitute for an automated repeatable concurrency test.

The automated test suite returned **28 passing tests and 0 failures** during the recorded development run. The exact coverage of individual integration scenarios should be assessed from the test files; the passing count alone does not imply that every failure/recovery scenario is covered.

## Known limitations and scope

- The three-instance concurrency scenario described above was verified manually. Add it to an automated integration test to make the evidence repeatable in CI.
- The pending-reference retry path is implemented, but its complete lifecycle (missing reference, later arrival, successful reversal, expiry, and concurrent workers) should receive dedicated integration tests before being treated as fully verified.
- The inbox consumer currently records message receipt/deduplication and acknowledges after commit. Any additional downstream business side effect should be implemented in the same inbox transaction or protected by its own idempotency strategy.
- The Compose setup starts PostgreSQL and MiniStack, but SQS FIFO queues must be provisioned separately.
- Authentication and authorization are outside the current implementation scope and should be added before exposing the service publicly.

## License

This project was created as a technical challenge. No open-source license is granted unless one is added explicitly.

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';

type OutboxRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly workerId = randomUUID();
  private readonly queueUrl = process.env.SQS_WAGERING_QUEUE_URL;

  private readonly sqs = new SQSClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: process.env.SQS_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    },
  });

  private stopped = false;
  private loopPromise?: Promise<void>;

  constructor(private readonly em: EntityManager) {}

  onModuleInit(): void {
    if (!this.queueUrl) {
      throw new Error('SQS_WAGERING_QUEUE_URL is not configured');
    }

    this.logger.log('Outbox publisher started');
    this.loopPromise = this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;

    await this.loopPromise;
    this.sqs.destroy();

    this.logger.log('Outbox publisher stopped');
  }

  private async poll(): Promise<void> {
    while (!this.stopped) {
      try {
        const events = await this.claimEvents();

        if (events.length === 0) {
          await this.sleep(2000);
          continue;
        }

        for (const event of events) {
          if (this.stopped) break;
          await this.publish(event);
        }
      } catch (error) {
        this.logger.error('Outbox polling failed', error);
        await this.sleep(3000);
      }
    }
  }

  private async claimEvents(): Promise<OutboxRow[]> {
    return this.em.transactional(async (tx) => {
      const rows = await tx.getConnection().execute(
        `
          WITH picked AS (
            SELECT id
            FROM outbox_events
            WHERE (
              status = 'PENDING'
              AND (
                next_attempt_at IS NULL
                OR next_attempt_at <= now()
              )
            )
            OR (
              status = 'PROCESSING'
              AND locked_until <= now()
            )
            ORDER BY created_at
            LIMIT ?
            FOR UPDATE SKIP LOCKED
          )
          UPDATE outbox_events AS event
          SET
            status = 'PROCESSING',
            locked_by = ?,
            locked_until = now() + interval '60 seconds',
            attempts = event.attempts + 1,
            updated_at = now()
          FROM picked
          WHERE event.id = picked.id
          RETURNING
            event.id,
            event.event_type,
            event.payload,
            event.attempts
        `,
        [10, this.workerId],
      );

      return rows as OutboxRow[];
    });
  }

  private async publish(event: OutboxRow): Promise<void> {
    try {
      const groupId = String(
        event.payload.walletId ??
          event.payload.playerId ??
          event.payload.providerId ??
          'wagering',
      ).slice(0, 128);

      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify({
            eventId: event.id,
            eventType: event.event_type,
            payload: event.payload,
          }),
          MessageGroupId: groupId,
          MessageDeduplicationId: event.id,
        }),
      );

      await this.em.getConnection().execute(
        `
          UPDATE outbox_events
          SET
            status = 'PUBLISHED',
            published_at = now(),
            locked_by = NULL,
            locked_until = NULL,
            next_attempt_at = NULL,
            last_error = NULL,
            updated_at = now()
          WHERE id = ?
            AND locked_by = ?
        `,
        [event.id, this.workerId],
      );

      this.logger.log(`Published event ${event.id}`);
    } catch (error) {
      await this.handleFailure(event, error);
    }
  }

  private async handleFailure(event: OutboxRow, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    const failed = event.attempts >= 10;
    const delaySeconds = Math.min(300, 2 ** Math.min(event.attempts, 8));

    await this.em.getConnection().execute(
      `
        UPDATE outbox_events
        SET
          status = ?,
          next_attempt_at = CASE
            WHEN ? = 'PENDING'
            THEN now() + (? * interval '1 second')
            ELSE NULL
          END,
          locked_by = NULL,
          locked_until = NULL,
          last_error = ?,
          updated_at = now()
        WHERE id = ?
          AND locked_by = ?
      `,
      [
        failed ? 'FAILED' : 'PENDING',
        failed ? 'FAILED' : 'PENDING',
        delaySeconds,
        message.slice(0, 1000),
        event.id,
        this.workerId,
      ],
    );

    this.logger.error(`Failed to publish event ${event.id}: ${message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

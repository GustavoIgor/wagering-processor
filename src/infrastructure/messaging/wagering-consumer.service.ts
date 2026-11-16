import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

const CONSUMER_NAME = 'wagering-events-consumer';

type WageringEvent = {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class WageringConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WageringConsumerService.name);
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

    this.logger.log('Wagering consumer started');
    this.loopPromise = this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.loopPromise;
    this.sqs.destroy();
    this.logger.log('Wagering consumer stopped');
  }

  private async poll(): Promise<void> {
    while (!this.stopped) {
      try {
        const result = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 10,
            VisibilityTimeout: 30,
          }),
        );

        for (const message of result.Messages ?? []) {
          if (this.stopped) break;

          try {
            await this.processMessage(message.ReceiptHandle, message.Body);
          } catch (error) {
            this.logger.error(
              `Could not process message ${message.MessageId}`,
              error,
            );
          }
        }
      } catch (error) {
        this.logger.error('SQS polling failed', error);
        await this.sleep(3000);
      }
    }
  }

  private async processMessage(
    receiptHandle?: string,
    body?: string,
  ): Promise<void> {
    if (!receiptHandle || !body) {
      throw new Error('SQS message is missing required fields');
    }

    const event = JSON.parse(body) as WageringEvent;

    if (
      typeof event.eventId !== 'string' ||
      typeof event.eventType !== 'string' ||
      typeof event.payload !== 'object' ||
      event.payload === null ||
      Array.isArray(event.payload)
    ) {
      throw new Error('Invalid wagering event format');
    }

    // Commit the Inbox record before acknowledging the SQS message.
    await this.em.transactional(async (tx) => {
      await tx.getConnection().execute(
        `
          INSERT INTO inbox_messages (
            id,
            consumer_name,
            message_id,
            processed_at,
            created_at
          )
          VALUES (
            gen_random_uuid(),
            ?,
            ?,
            now(),
            now()
          )
          ON CONFLICT (consumer_name, message_id) DO NOTHING
        `,
        [CONSUMER_NAME, event.eventId],
      );
    });

    // If the database transaction fails, this command is never reached.
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );

    this.logger.log(`Acknowledged ${event.eventType} event ${event.eventId}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

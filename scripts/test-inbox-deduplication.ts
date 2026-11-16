import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';

const client = new SQSClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

async function main() {
  const queueUrl = process.env.SQS_WAGERING_QUEUE_URL;

  if (!queueUrl) {
    throw new Error('SQS_WAGERING_QUEUE_URL is missing');
  }

  const eventId = randomUUID();

  const body = JSON.stringify({
    eventId,
    eventType: 'WAGER_PROCESSED',
    payload: {
      status: 'PROCESSED',
      playerId: 'dedup-test-player',
      operation: 'BET',
      providerId: 'dedup-test-provider',
      transactionId: randomUUID(),
    },
  });

  for (let i = 0; i < 2; i++) {
    await client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        MessageGroupId: 'dedup-test',
        MessageDeduplicationId: randomUUID(),
      }),
    );
  }

  console.log('Two messages sent with the same eventId:', eventId);
  client.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { SQSClient, ReceiveMessageCommand } from '@aws-sdk/client-sqs';

const client = new SQSClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  endpoint: process.env.SQS_ENDPOINT ?? 'http://localhost:4566',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

async function main() {
  const result = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: process.env.SQS_WAGERING_QUEUE_URL,
      MaxNumberOfMessages: 5,
      WaitTimeSeconds: 2,
      VisibilityTimeout: 10,
    }),
  );

  console.log(
    JSON.stringify(
      result.Messages?.map((message) => ({
        messageId: message.MessageId,
        body: message.Body ? JSON.parse(message.Body) : null,
      })) ?? [],
      null,
      2,
    ),
  );

  client.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

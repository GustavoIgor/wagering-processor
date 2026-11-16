import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';

const client = new SQSClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

async function main() {
  const dlq = await client.send(
    new CreateQueueCommand({
      QueueName: 'wagering-events-dlq.fifo',
      Attributes: {
        FifoQueue: 'true',
        ContentBasedDeduplication: 'false',
      },
    }),
  );

  if (!dlq.QueueUrl) {
    throw new Error('Could not create DLQ');
  }

  const dlqAttributes = await client.send(
    new GetQueueAttributesCommand({
      QueueUrl: dlq.QueueUrl,
      AttributeNames: ['QueueArn'],
    }),
  );

  const dlqArn = dlqAttributes.Attributes?.QueueArn;

  if (!dlqArn) {
    throw new Error('Could not retrieve DLQ ARN');
  }

  const mainQueue = await client.send(
    new CreateQueueCommand({
      QueueName: 'wagering-events.fifo',
      Attributes: {
        FifoQueue: 'true',
        ContentBasedDeduplication: 'false',
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: dlqArn,
          maxReceiveCount: '5',
        }),
      },
    }),
  );

  console.log('DLQ:', dlq.QueueUrl);
  console.log('Main queue:', mainQueue.QueueUrl);
  console.log('DLQ ARN:', dlqArn);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

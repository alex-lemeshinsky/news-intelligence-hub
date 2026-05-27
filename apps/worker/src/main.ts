import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAMES, type QueueName } from '@nih/shared';
import { disconnectPrismaClient, getPrismaClient } from '@nih/database';
import type { FeedPullDatabase } from './feed-pull.processor.js';
import { handleQueueJob } from './processors.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
const dependencies = {
  feedPull: {
    database: getPrismaClient() as unknown as FeedPullDatabase,
    minContentChars: Number.parseInt(
      process.env.ARTICLE_MIN_CONTENT_CHARS ?? '500',
      10,
    ),
  },
};

function createQueue(name: QueueName): Queue {
  return new Queue(name, { connection });
}

function createWorker(name: QueueName): Worker {
  return new Worker(
    name,
    async (job) => handleQueueJob(name, job, dependencies),
    { connection },
  );
}

const queues = Object.values(QUEUE_NAMES).map(createQueue);
const workers = Object.values(QUEUE_NAMES).map(createWorker);

async function shutdown(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(queues.map((queue) => queue.close()));
  await connection.quit();
  await disconnectPrismaClient();
}

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});

console.log(
  JSON.stringify({
    event: 'worker.started',
    queues: Object.values(QUEUE_NAMES),
    redisUrl,
  }),
);

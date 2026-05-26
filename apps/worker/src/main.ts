import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAMES, type QueueName } from '@nih/shared';
import { handleQueueJob } from './processors.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

function createQueue(name: QueueName): Queue {
  return new Queue(name, { connection });
}

function createWorker(name: QueueName): Worker {
  return new Worker(
    name,
    async (job) => handleQueueJob(name, job),
    { connection },
  );
}

const queues = Object.values(QUEUE_NAMES).map(createQueue);
const workers = Object.values(QUEUE_NAMES).map(createWorker);

async function shutdown(): Promise<void> {
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(queues.map((queue) => queue.close()));
  await connection.quit();
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

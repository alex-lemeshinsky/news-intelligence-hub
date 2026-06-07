import { JobsOptions, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  JOB_NAMES,
  QUEUE_NAMES,
  type ArticleProcessingJobData,
  type QueueName,
} from '@nih/shared';
import { disconnectPrismaClient, getPrismaClient } from '@nih/database';
import type { ArticleProcessingDatabase } from './article-processing.processor.js';
import type { DigestDatabase } from './digest.processor.js';
import type { FeedPullDatabase } from './feed-pull.processor.js';
import { createConfiguredLlmClient } from './llm-client.js';
import { handleQueueJob } from './processors.js';

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL is required to start the worker.');
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
const prismaClient = getPrismaClient();
const queueMap = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue {
  const existingQueue = queueMap.get(name);
  if (existingQueue) {
    return existingQueue;
  }

  const queue = new Queue(name, { connection });
  queueMap.set(name, queue);
  return queue;
}

const dependencies = {
  articleProcessing: {
    database: prismaClient as unknown as ArticleProcessingDatabase,
    llm: createConfiguredLlmClient(),
  },
  digest: {
    database: prismaClient as unknown as DigestDatabase,
    llm: createConfiguredLlmClient(),
  },
  feedPull: {
    database: prismaClient as unknown as FeedPullDatabase,
    enqueueArticleProcessing: async (payload: ArticleProcessingJobData) => {
      await getQueue(QUEUE_NAMES.articleProcessing).add(
        JOB_NAMES.processArticle,
        payload,
        defaultJobOptions(),
      );
    },
    minContentChars: Number.parseInt(
      process.env.ARTICLE_MIN_CONTENT_CHARS ?? '500',
      10,
    ),
  },
};

function createQueue(name: QueueName): Queue {
  return getQueue(name);
}

function createWorker(name: QueueName): Worker {
  return new Worker(
    name,
    async (job) => handleQueueJob(name, job, dependencies),
    {
      concurrency:
        name === QUEUE_NAMES.articleProcessing
          ? parseIntegerEnv('LLM_CONCURRENCY', 2)
          : parseIntegerEnv('WORKER_CONCURRENCY', 4),
      connection,
    },
  );
}

const queues = Object.values(QUEUE_NAMES).map(createQueue);
const workers = Object.values(QUEUE_NAMES).map(createWorker);

function defaultJobOptions(): JobsOptions {
  return {
    attempts: parseIntegerEnv('QUEUE_JOB_ATTEMPTS', 3),
    backoff: {
      delay: parseIntegerEnv('QUEUE_JOB_BACKOFF_MS', 5000),
      type: 'exponential',
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  };
}

function parseIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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

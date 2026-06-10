import { JobsOptions, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  JOB_NAMES,
  QUEUE_NAMES,
  type ArticleProcessingJobData,
  type FeedPullJobData,
  type QueueName,
} from '@nih/shared';
import { disconnectPrismaClient, getPrismaClient } from '@nih/database';
import type { ArticleProcessingDatabase } from './article-processing.processor.js';
import { RedisCacheLockCoordinator } from './cache-lock.js';
import type { DigestDatabase } from './digest.processor.js';
import type { FeedPullDatabase } from './feed-pull.processor.js';
import { createConfiguredLlmClient } from './llm-client.js';
import { structuredLog } from './logger.js';
import { handleQueueJob } from './processors.js';

const DEFAULT_FEED_PULL_CRON = '*/15 * * * *';
const FEED_PULL_SCHEDULER_ID = 'active-feed-pull-scheduler';
const FEED_PULL_SCHEDULER_START_DELAY_MS = 60_000;

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL is required to start the worker.');
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
const prismaClient = getPrismaClient();
const cacheLocks = new RedisCacheLockCoordinator(connection, {
  retryMs: parseIntegerEnv('LLM_CACHE_LOCK_RETRY_MS', 250),
  ttlMs: parseIntegerEnv('LLM_CACHE_LOCK_TTL_MS', 120000),
  waitMs: parseIntegerEnv(
    'LLM_CACHE_LOCK_WAIT_MS',
    parseIntegerEnv('LLM_REQUEST_TIMEOUT_MS', 30000),
  ),
});
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
    cacheLocks,
    database: prismaClient as unknown as ArticleProcessingDatabase,
    llm: createConfiguredLlmClient(),
  },
  digest: {
    database: prismaClient as unknown as DigestDatabase,
    llm: createConfiguredLlmClient(),
  },
  feedPull: {
    database: prismaClient as unknown as FeedPullDatabase,
    enqueueFeedPull: async (
      payload: FeedPullJobData,
      options: JobsOptions = {},
    ) => {
      await getQueue(QUEUE_NAMES.feedPull).add(
        JOB_NAMES.pullFeed,
        payload,
        {
          ...defaultJobOptions(),
          ...options,
        },
      );
    },
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

await configureScheduledFeedPulls();

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

async function configureScheduledFeedPulls(): Promise<void> {
  const pattern =
    process.env.FEED_PULL_CRON?.trim() || DEFAULT_FEED_PULL_CRON;
  const startDate = Date.now() + FEED_PULL_SCHEDULER_START_DELAY_MS;
  await getQueue(QUEUE_NAMES.feedPull).upsertJobScheduler(
    FEED_PULL_SCHEDULER_ID,
    { pattern, startDate },
    {
      data: {},
      name: JOB_NAMES.scheduleFeedPulls,
      opts: defaultJobOptions(),
    },
  );

  structuredLog('feed.pull.scheduler.configured', {
    pattern,
    schedulerId: FEED_PULL_SCHEDULER_ID,
    startDate: new Date(startDate).toISOString(),
  });
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

structuredLog('worker.started', {
  queues: Object.values(QUEUE_NAMES),
  redisUrl,
});

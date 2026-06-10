import { Job } from 'bullmq';
import {
  ArticleProcessingJobData,
  DigestJobData,
  FeedPullJobData,
  JOB_NAMES,
  QUEUE_NAMES,
  QueueName,
  RegenerationJobData,
} from '@nih/shared';
import {
  ArticleProcessingDependencies,
  processArticleJob,
  processRegenerationJob,
} from './article-processing.processor.js';
import { DigestDependencies, processDigestJob } from './digest.processor.js';
import {
  FeedPullDependencies,
  pullFeedJob,
  scheduleFeedPullsJob,
} from './feed-pull.processor.js';
import { errorMessage, structuredLog } from './logger.js';

export interface WorkerDependencies {
  articleProcessing: ArticleProcessingDependencies;
  digest: DigestDependencies;
  feedPull: FeedPullDependencies;
}

export async function handleQueueJob(
  queueName: QueueName,
  job: Job,
  dependencies: WorkerDependencies,
): Promise<void> {
  const context = {
    jobId: job.id,
    jobName: job.name,
    queue: queueName,
  };
  structuredLog('worker.job.received', context);
  const startedAt = Date.now();

  try {
    await dispatchQueueJob(queueName, job, dependencies);
    structuredLog('worker.job.completed', {
      ...context,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    structuredLog(
      'worker.job.failed',
      {
        ...context,
        durationMs: Date.now() - startedAt,
        error: errorMessage(error),
      },
      'error',
    );
    throw error;
  }
}

async function dispatchQueueJob(
  queueName: QueueName,
  job: Job,
  dependencies: WorkerDependencies,
): Promise<void> {
  if (!Object.values(QUEUE_NAMES).includes(queueName)) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  if (queueName === QUEUE_NAMES.feedPull && job.name === JOB_NAMES.pullFeed) {
    await pullFeedJob(dependencies.feedPull, job.data as FeedPullJobData);
    return;
  }

  if (
    queueName === QUEUE_NAMES.feedPull &&
    job.name === JOB_NAMES.scheduleFeedPulls
  ) {
    await scheduleFeedPullsJob(dependencies.feedPull);
    return;
  }

  if (
    queueName === QUEUE_NAMES.articleProcessing &&
    job.name === JOB_NAMES.processArticle
  ) {
    await processArticleJob(
      dependencies.articleProcessing,
      job.data as ArticleProcessingJobData,
    );
    return;
  }

  if (
    queueName === QUEUE_NAMES.regeneration &&
    job.name === JOB_NAMES.regenerateArticles
  ) {
    await processRegenerationJob(
      dependencies.articleProcessing,
      job.data as RegenerationJobData,
    );
    return;
  }

  if (queueName === QUEUE_NAMES.digest && job.name === JOB_NAMES.buildDigest) {
    await processDigestJob(dependencies.digest, job.data as DigestJobData);
    return;
  }

  throw new Error(`Unknown job ${job.name} for queue ${queueName}`);
}

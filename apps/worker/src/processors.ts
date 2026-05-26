import { Job } from 'bullmq';
import { QUEUE_NAMES, QueueName } from '@nih/shared';

export const WORKER_JOB_NAMES = {
  pullFeed: 'pull-feed',
  processArticle: 'process-article',
  regenerateArticles: 'regenerate-articles',
  buildDigest: 'build-digest',
} as const;

export async function handleQueueJob(queueName: QueueName, job: Job): Promise<void> {
  console.log(
    JSON.stringify({
      event: 'worker.job.received',
      queue: queueName,
      jobId: job.id,
      jobName: job.name,
    }),
  );

  if (!Object.values(QUEUE_NAMES).includes(queueName)) {
    throw new Error(`Unknown queue: ${queueName}`);
  }
}

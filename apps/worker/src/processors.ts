import { Job } from 'bullmq';
import { FeedPullJobData, JOB_NAMES, QUEUE_NAMES, QueueName } from '@nih/shared';
import { FeedPullDependencies, pullFeedJob } from './feed-pull.processor.js';

export interface WorkerDependencies {
  feedPull: FeedPullDependencies;
}

export async function handleQueueJob(
  queueName: QueueName,
  job: Job,
  dependencies: WorkerDependencies,
): Promise<void> {
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

  if (queueName === QUEUE_NAMES.feedPull && job.name === JOB_NAMES.pullFeed) {
    await pullFeedJob(dependencies.feedPull, job.data as FeedPullJobData);
  }
}

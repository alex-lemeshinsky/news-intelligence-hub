export const QUEUE_NAMES = {
  feedPull: 'feed-pull',
  articleProcessing: 'article-processing',
  regeneration: 'regeneration',
  digest: 'digest',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  pullFeed: 'pull-feed',
  processArticle: 'process-article',
  regenerateArticles: 'regenerate-articles',
  buildDigest: 'build-digest',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

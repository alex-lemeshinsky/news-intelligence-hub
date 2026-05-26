export const QUEUE_NAMES = {
  feedPull: 'feed-pull',
  articleProcessing: 'article-processing',
  regeneration: 'regeneration',
  digest: 'digest',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

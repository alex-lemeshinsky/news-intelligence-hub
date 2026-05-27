export const FeedStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  PULL_ERROR: 'PULL_ERROR',
} as const;

export type FeedStatus = (typeof FeedStatus)[keyof typeof FeedStatus];

export const ArticleProcessingStatus = {
  PENDING: 'PENDING',
  FILTERED: 'FILTERED',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const;

export type ArticleProcessingStatus =
  (typeof ArticleProcessingStatus)[keyof typeof ArticleProcessingStatus];

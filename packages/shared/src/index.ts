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

export interface FeedPullJobData {
  feedId: string;
  userId: string;
}

export interface ArticleProcessingJobData {
  articleId: string;
  articleLabelId: string;
  userId: string;
}

export interface RegenerationJobData {
  runId: string;
  userId: string;
}

export interface DigestJobData {
  digestId: string;
  userId: string;
}

export const ENTITY_TYPES = [
  'person',
  'company',
  'product',
  'technology',
  'location',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export const ARTICLE_IMPORTANCE = ['high', 'normal', 'junk'] as const;

export type ArticleImportance = (typeof ARTICLE_IMPORTANCE)[number];

export const GRAPH_EDGE_KINDS = ['mentions', 'co_mention', 'similar'] as const;

export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

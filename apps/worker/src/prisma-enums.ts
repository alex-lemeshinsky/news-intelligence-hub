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

export const ArticleImportance = {
  HIGH: 'HIGH',
  NORMAL: 'NORMAL',
  JUNK: 'JUNK',
} as const;

export type ArticleImportance =
  (typeof ArticleImportance)[keyof typeof ArticleImportance];

export const EntityType = {
  PERSON: 'PERSON',
  COMPANY: 'COMPANY',
  PRODUCT: 'PRODUCT',
  TECHNOLOGY: 'TECHNOLOGY',
  LOCATION: 'LOCATION',
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const GraphEdgeKind = {
  MENTIONS: 'MENTIONS',
  CO_MENTION: 'CO_MENTION',
  SIMILAR: 'SIMILAR',
} as const;

export type GraphEdgeKind = (typeof GraphEdgeKind)[keyof typeof GraphEdgeKind];

export const LlmOperation = {
  ARTICLE_ANALYSIS: 'ARTICLE_ANALYSIS',
  ENTITY_MATCH: 'ENTITY_MATCH',
  DIGEST: 'DIGEST',
  REGENERATION: 'REGENERATION',
} as const;

export type LlmOperation = (typeof LlmOperation)[keyof typeof LlmOperation];

export const LlmProvider = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
} as const;

export type LlmProvider = (typeof LlmProvider)[keyof typeof LlmProvider];

export const BackgroundStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type BackgroundStatus =
  (typeof BackgroundStatus)[keyof typeof BackgroundStatus];

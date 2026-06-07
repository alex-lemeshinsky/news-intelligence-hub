export interface AuthUser {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface RegisterResponse extends AuthResponse {
  devConfirmationToken?: string;
  devConfirmationUrl?: string;
}

export interface ResendConfirmationResponse {
  ok: true;
  devConfirmationToken?: string;
  devConfirmationUrl?: string;
}

export interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

export type FeedStatus = "ACTIVE" | "PAUSED" | "PULL_ERROR";

export interface Feed {
  id: string;
  url: string;
  title: string | null;
  status: FeedStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface ClassificationAxis {
  id: string;
  name: string;
  values: string[];
  createdAt: string;
  updatedAt: string;
}

export type BackgroundStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface RegenerationRun {
  id: string;
  userId: string;
  status: BackgroundStatus;
  total: number;
  processed: number;
  failed: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LlmOperation =
  | "ARTICLE_ANALYSIS"
  | "ENTITY_MATCH"
  | "DIGEST"
  | "REGENERATION";

export type LlmProvider = "OPENAI" | "ANTHROPIC";

export interface LlmTelemetryTotals {
  averageLatencyMs: number;
  calls: number;
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

export interface LlmTelemetryOperationSummary {
  calls: number;
  completionTokens: number;
  operation: LlmOperation;
  promptTokens: number;
  success: boolean;
  totalTokens: number;
}

export interface LlmTelemetryProviderModelSummary {
  calls: number;
  completionTokens: number;
  model: string;
  promptTokens: number;
  provider: LlmProvider;
  totalTokens: number;
}

export interface LlmTelemetryOverview {
  byOperation: LlmTelemetryOperationSummary[];
  byProviderModel: LlmTelemetryProviderModelSummary[];
  totals: LlmTelemetryTotals;
}

export type ArticleProcessingStatus =
  | "PENDING"
  | "FILTERED"
  | "PROCESSED"
  | "FAILED";

export type ArticleImportance = "HIGH" | "NORMAL" | "JUNK";

export interface ArticleFeedItem {
  id: string;
  title: string;
  sourceId: string | null;
  sourceTitle: string | null;
  publishedAt: string | null;
  status: ArticleProcessingStatus;
  importance: ArticleImportance | null;
  summary: string | null;
  originalUrl: string;
  preFilterReason: string | null;
  duplicateCount: number;
  similarCount: number;
  categories: Array<{
    id: string;
    name: string;
  }>;
  axes: Array<{
    axisId: string;
    axisName: string;
    value: string;
  }>;
  entities: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

export interface ArticleFeedResponse {
  items: ArticleFeedItem[];
}

export interface DuplicateSource {
  feedId: string;
  originalUrl: string;
  pulledAt: string;
  sourceTitle: string;
  sourceUrl: string;
}

export interface SimilarArticleSummary {
  articleId: string;
  articleLabelId: string | null;
  importance: ArticleImportance | null;
  kind: string;
  publishedAt: string | null;
  score: number | null;
  similarityId: string;
  summary: string | null;
  title: string;
}

export interface ArticleDetail extends ArticleFeedItem {
  articleId: string;
  duplicateSources: DuplicateSource[];
  similarArticles: SimilarArticleSummary[];
}

export type GraphNodeKind = "article" | "entity";

export type GraphEdgeKind = "mentions" | "co_mention" | "similar";

export interface GraphArticleNode {
  articleId: string;
  articleLabelId: string;
  categories: Array<{
    id: string;
    name: string;
  }>;
  id: string;
  importance: ArticleImportance | null;
  kind: "article";
  label: string;
  publishedAt: string | null;
  summary: string | null;
  timestamp: number | null;
}

export interface GraphEntityNode {
  aliases: string[];
  articleCount: number;
  description: string | null;
  entityId: string;
  entityType: string;
  firstSeen: number | null;
  id: string;
  kind: "entity";
  label: string;
  lastSeen: number | null;
}

export type GraphNode = GraphArticleNode | GraphEntityNode;

export interface GraphEdge {
  categoryId: string | null;
  edgeId: string;
  fromNodeId: string;
  kind: GraphEdgeKind;
  score: number | null;
  timestamp: number | null;
  toNodeId: string;
  weight: number | null;
}

export interface GraphResponse {
  edges: GraphEdge[];
  nodes: GraphNode[];
}

export interface EntityMentionArticle {
  articleId: string;
  articleLabelId: string;
  categories: Array<{
    id: string;
    name: string;
  }>;
  importance: ArticleImportance | null;
  publishedAt: string | null;
  summary: string | null;
  title: string;
}

export interface RelatedEntity {
  description: string | null;
  entityId: string;
  entityType: string;
  label: string;
  weight: number;
}

export interface EntityDetail {
  aliases: string[];
  articleCount: number;
  description: string | null;
  entityId: string;
  entityType: string;
  firstSeen: number | null;
  label: string;
  lastSeen: number | null;
  mentionActivity: Array<{
    count: number;
    date: string;
  }>;
  mentioningArticles: EntityMentionArticle[];
  relatedEntities: RelatedEntity[];
}

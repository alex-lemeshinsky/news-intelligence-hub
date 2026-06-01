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

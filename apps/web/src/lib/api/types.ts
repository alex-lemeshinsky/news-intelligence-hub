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

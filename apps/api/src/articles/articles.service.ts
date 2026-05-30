import { Injectable } from '@nestjs/common';
import { ArticleImportance, ArticleProcessingStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ArticlesService {
  constructor(private readonly database: DatabaseService) {}

  async list(userId: string, filters: ArticleListFilters) {
    const labels = await this.database.articleLabel.findMany({
      include: {
        article: {
          include: {
            feedItems: {
              include: {
                feed: true,
              },
              where: {
                feed: {
                  userId,
                },
              },
            },
            similaritySource: {
              where: { userId },
            },
            similarityTarget: {
              where: { userId },
            },
          },
        },
        axes: {
          include: {
            axis: true,
          },
        },
        categories: {
          include: {
            category: true,
          },
        },
        mentions: {
          include: {
            entity: true,
          },
        },
      },
      orderBy: [{ article: { publishedAt: 'desc' } }, { createdAt: 'desc' }],
      where: buildWhere(userId, filters),
    });

    return {
      items: labels.map(mapArticleLabel),
    };
  }
}

export interface ArticleListFilters {
  categoryId?: string;
  feedId?: string;
  importance?: ArticleImportance;
  status?: ArticleProcessingStatus;
  timeWindow?: '24h' | '7d' | '30d';
}

interface ArticleLabelRecord {
  article: {
    canonicalUrl: string | null;
    feedItems: Array<{
      feed: {
        id: string;
        title: string | null;
        url: string;
      };
      originalUrl: string;
    }>;
    id: string;
    normalizedUrl: string;
    publishedAt: Date | null;
    similaritySource: unknown[];
    similarityTarget: unknown[];
    title: string;
  };
  axes: Array<{
    axis: {
      id: string;
      name: string;
    };
    value: string;
  }>;
  categories: Array<{
    category: {
      id: string;
      name: string;
    };
  }>;
  id: string;
  importance: ArticleImportance | null;
  mentions: Array<{
    entity: {
      canonicalName: string;
      id: string;
      type: string;
    };
  }>;
  preFilterReason: string | null;
  status: ArticleProcessingStatus;
  summary: string | null;
}

function buildWhere(userId: string, filters: ArticleListFilters) {
  const where: Record<string, unknown> = { userId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.importance) {
    where.importance = filters.importance;
  }

  if (filters.categoryId) {
    where.categories = {
      some: {
        categoryId: filters.categoryId,
      },
    };
  }

  const articleWhere: Record<string, unknown> = {};
  if (filters.feedId) {
    articleWhere.feedItems = {
      some: {
        feed: { userId },
        feedId: filters.feedId,
      },
    };
  }

  const publishedAfter = timeWindowStart(filters.timeWindow);
  if (publishedAfter) {
    articleWhere.publishedAt = {
      gte: publishedAfter,
    };
  }

  if (Object.keys(articleWhere).length > 0) {
    where.article = articleWhere;
  }

  return where;
}

function timeWindowStart(timeWindow: ArticleListFilters['timeWindow']) {
  if (!timeWindow) {
    return undefined;
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const daysByWindow = {
    '24h': 1,
    '7d': 7,
    '30d': 30,
  } as const;

  return new Date(now - daysByWindow[timeWindow] * dayMs);
}

function mapArticleLabel(label: ArticleLabelRecord) {
  const firstFeedItem = label.article.feedItems[0];
  const duplicateCount = Math.max(label.article.feedItems.length - 1, 0);
  const modelSimilarityCount =
    label.article.similaritySource.length + label.article.similarityTarget.length;

  return {
    axes: label.axes.map((assignment) => ({
      axisId: assignment.axis.id,
      axisName: assignment.axis.name,
      value: assignment.value,
    })),
    categories: label.categories.map((assignment) => ({
      id: assignment.category.id,
      name: assignment.category.name,
    })),
    duplicateCount,
    entities: label.mentions.map((mention) => ({
      id: mention.entity.id,
      name: mention.entity.canonicalName,
      type: mention.entity.type,
    })),
    id: label.id,
    importance: label.importance,
    originalUrl:
      firstFeedItem?.originalUrl ??
      label.article.canonicalUrl ??
      label.article.normalizedUrl,
    preFilterReason: label.preFilterReason,
    publishedAt: label.article.publishedAt,
    similarCount: duplicateCount + modelSimilarityCount,
    sourceId: firstFeedItem?.feed.id ?? null,
    sourceTitle: firstFeedItem?.feed.title ?? firstFeedItem?.feed.url ?? null,
    status: label.status,
    summary: label.summary,
    title: label.article.title,
  };
}

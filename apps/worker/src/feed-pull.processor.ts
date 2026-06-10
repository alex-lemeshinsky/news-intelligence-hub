import { createHash } from 'crypto';
import type { JobsOptions } from 'bullmq';
import { ArticleProcessingJobData, FeedPullJobData } from '@nih/shared';
import { ParsedFeed, parseFeedUrl } from './feed-parser.js';
import { structuredLog } from './logger.js';
import { preFilterArticle } from './pre-filter.js';
import { ArticleProcessingStatus, FeedStatus } from './prisma-enums.js';

const DEMO_FEED_HOSTNAME = 'demo.news-intelligence.local';

export interface FeedPullDependencies {
  database: FeedPullDatabase;
  enqueueArticleProcessing?: (
    payload: ArticleProcessingJobData,
  ) => Promise<void>;
  enqueueFeedPull?: (
    payload: FeedPullJobData,
    options?: JobsOptions,
  ) => Promise<void>;
  parseFeed?: (url: string) => Promise<ParsedFeed>;
  minContentChars?: number;
}

export interface FeedPullDatabase {
  article: {
    upsert(args: Record<string, unknown>): Promise<{ id: string }>;
  };
  articleLabel: {
    upsert(args: Record<string, unknown>): Promise<{ id: string }>;
  };
  feed: {
    findMany(args: Record<string, unknown>): Promise<
      Array<{
        id: string;
        userId: string;
        url: string;
      }>
    >;
    findFirst(args: Record<string, unknown>): Promise<{
      id: string;
      userId: string;
      url: string;
      title?: string | null;
    } | null>;
    update(args: Record<string, unknown>): Promise<unknown>;
  };
  feedArticle: {
    upsert(args: Record<string, unknown>): Promise<unknown>;
  };
}

export async function scheduleFeedPullsJob(
  dependencies: FeedPullDependencies,
): Promise<void> {
  if (!dependencies.enqueueFeedPull) {
    throw new Error('Feed pull enqueue dependency is required.');
  }

  const feeds = await dependencies.database.feed.findMany({
    select: {
      id: true,
      userId: true,
      url: true,
    },
    where: {
      status: FeedStatus.ACTIVE,
    },
  });

  let enqueued = 0;
  for (const feed of feeds) {
    if (isDemoSeedFeedUrl(feed.url)) {
      continue;
    }

    await dependencies.enqueueFeedPull(
      {
        feedId: feed.id,
        userId: feed.userId,
      },
      {
        deduplication: {
          id: `feed-pull:${feed.id}`,
          keepLastIfActive: true,
        },
      },
    );
    enqueued += 1;
  }

  structuredLog('feed.pull.schedule.completed', {
    activeFeeds: feeds.length,
    enqueued,
  });
}

export async function pullFeedJob(
  dependencies: FeedPullDependencies,
  payload: FeedPullJobData,
): Promise<void> {
  const feed = await dependencies.database.feed.findFirst({
    where: {
      id: payload.feedId,
      userId: payload.userId,
    },
  });

  if (!feed) {
    throw new Error('Feed not found for user.');
  }

  if (isDemoSeedFeedUrl(feed.url)) {
    await dependencies.database.feed.update({
      where: { id: feed.id },
      data: {
        status: FeedStatus.ACTIVE,
        lastError: null,
      },
    });
    structuredLog('feed.pull.demo_skipped', {
      feedId: feed.id,
      userId: payload.userId,
    });
    return;
  }

  try {
    const parsedFeed = await (dependencies.parseFeed ?? parseFeedUrl)(feed.url);
    let pending = 0;
    let filtered = 0;
    for (const item of parsedFeed.items) {
      const status = await persistFeedItem(
        dependencies,
        payload,
        feed.id,
        item,
      );
      if (status === ArticleProcessingStatus.PENDING) {
        pending += 1;
      } else {
        filtered += 1;
      }
    }

    await dependencies.database.feed.update({
      where: { id: feed.id },
      data: {
        status: FeedStatus.ACTIVE,
        lastError: null,
        title: parsedFeed.title ?? feed.title,
      },
    });

    structuredLog('feed.pull.completed', {
      feedId: feed.id,
      userId: payload.userId,
      itemCount: parsedFeed.items.length,
      pending,
      filtered,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    await dependencies.database.feed.update({
      where: { id: feed.id },
      data: {
        status: FeedStatus.PULL_ERROR,
        lastError: message,
      },
    });

    structuredLog(
      'feed.pull.failed',
      {
        feedId: feed.id,
        userId: payload.userId,
        error: message,
      },
      'error',
    );
    throw error;
  }
}

async function persistFeedItem(
  dependencies: FeedPullDependencies,
  payload: FeedPullJobData,
  feedId: string,
  item: ParsedFeed['items'][number],
): Promise<ArticleProcessingStatus> {
  const normalizedUrl = normalizeArticleUrl(item.url);
  const preFilter = preFilterArticle(
    {
      title: item.title,
      content: item.content,
    },
    {
      minContentChars: dependencies.minContentChars ?? 500,
    },
  );
  const contentHash = hashContent(preFilter.text || item.content || item.title);

  const article = await dependencies.database.article.upsert({
    where: { normalizedUrl },
    create: {
      normalizedUrl,
      contentHash,
      canonicalUrl: item.url,
      title: item.title,
      author: item.author,
      publishedAt: item.publishedAt,
      rawContent: item.content,
      extractedText: preFilter.text,
    },
    update: {
      title: item.title,
      author: item.author,
      publishedAt: item.publishedAt,
      rawContent: item.content,
      extractedText: preFilter.text,
      contentHash,
    },
  });

  await dependencies.database.feedArticle.upsert({
    where: {
      feedId_articleId: {
        feedId,
        articleId: article.id,
      },
    },
    create: {
      feedId,
      articleId: article.id,
      externalId: item.externalId,
      originalUrl: item.url,
    },
    update: {
      externalId: item.externalId,
      originalUrl: item.url,
      pulledAt: new Date(),
    },
  });

  const status = preFilter.accepted
    ? ArticleProcessingStatus.PENDING
    : ArticleProcessingStatus.FILTERED;

  const articleLabel = await dependencies.database.articleLabel.upsert({
    where: {
      userId_articleId: {
        userId: payload.userId,
        articleId: article.id,
      },
    },
    create: {
      userId: payload.userId,
      articleId: article.id,
      status,
      preFilterReason: preFilter.reason,
    },
    update: {
      status,
      preFilterReason: preFilter.reason,
    },
  });

  if (status === ArticleProcessingStatus.PENDING) {
    await dependencies.enqueueArticleProcessing?.({
      articleId: article.id,
      articleLabelId: articleLabel.id,
      userId: payload.userId,
    });
  }

  return status;
}

export function normalizeArticleUrl(url: string): string {
  const parsedUrl = new URL(url);
  parsedUrl.hash = '';
  parsedUrl.protocol = parsedUrl.protocol.toLowerCase();
  parsedUrl.hostname = parsedUrl.hostname.toLowerCase();

  const sortedParams = [...parsedUrl.searchParams.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  parsedUrl.search = '';
  for (const [key, value] of sortedParams) {
    parsedUrl.searchParams.append(key, value);
  }

  return parsedUrl.toString();
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown feed pull error.';
}

function isDemoSeedFeedUrl(url: string): boolean {
  try {
    return new URL(url).hostname === DEMO_FEED_HOSTNAME;
  } catch {
    return false;
  }
}

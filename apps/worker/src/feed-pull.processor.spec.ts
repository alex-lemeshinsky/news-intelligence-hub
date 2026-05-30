import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ArticleProcessingStatus, FeedStatus } from './prisma-enums.js';
import { pullFeedJob } from './feed-pull.processor.js';

describe('pullFeedJob', () => {
  it('persists feed articles and marks usable content pending processing', async () => {
    const calls: string[] = [];
    const database = createDatabaseDouble(calls);
    const enqueuedJobs: unknown[] = [];

    await pullFeedJob(
      {
        database,
        enqueueArticleProcessing: async (payload) => {
          calls.push('articleProcessing.enqueue');
          enqueuedJobs.push(payload);
        },
        parseFeed: async () => ({
          title: 'Tech Feed',
          items: [
            {
              title: 'Microsoft ships a new AI runtime',
              url: 'https://Example.com/article?b=2&a=1#fragment',
              content: 'A'.repeat(800),
              author: 'Reporter',
              publishedAt: new Date('2026-05-27T10:00:00.000Z'),
            },
          ],
        }),
        minContentChars: 500,
      },
      {
        feedId: 'feed_1',
        userId: 'user_1',
      },
    );

    assert.deepEqual(calls, [
      'feed.findFirst',
      'article.upsert',
      'feedArticle.upsert',
      'articleLabel.upsert:PENDING',
      'articleProcessing.enqueue',
      'feed.update:ACTIVE',
    ]);
    assert.equal(database.article.upsertCalls[0]?.where.normalizedUrl, 'https://example.com/article?a=1&b=2');
    assert.deepEqual(enqueuedJobs, [
      {
        articleId: 'article_1',
        articleLabelId: 'label_1',
        userId: 'user_1',
      },
    ]);
  });

  it('stores deterministic pre-filter results without sending junk forward', async () => {
    const calls: string[] = [];
    const database = createDatabaseDouble(calls);
    let enqueuedJobs = 0;

    await pullFeedJob(
      {
        database,
        enqueueArticleProcessing: async () => {
          enqueuedJobs += 1;
        },
        parseFeed: async () => ({
          title: 'Tech Feed',
          items: [
            {
              title: 'Tiny item',
              url: 'https://example.com/tiny',
              content: 'short',
            },
          ],
        }),
        minContentChars: 500,
      },
      {
        feedId: 'feed_1',
        userId: 'user_1',
      },
    );

    assert.ok(calls.includes('articleLabel.upsert:FILTERED'));
    assert.equal(database.articleLabel.upsertCalls[0]?.create.preFilterReason, 'too_short');
    assert.equal(enqueuedJobs, 0);
  });

  it('marks the feed with pull error when parsing fails', async () => {
    const calls: string[] = [];
    const database = createDatabaseDouble(calls);

    await assert.rejects(
      pullFeedJob(
        {
          database,
          parseFeed: async () => {
            throw new Error('feed is unreachable');
          },
          minContentChars: 500,
        },
        {
          feedId: 'feed_1',
          userId: 'user_1',
        },
      ),
      /feed is unreachable/,
    );

    assert.ok(calls.includes('feed.update:PULL_ERROR'));
  });
});

function createDatabaseDouble(calls: string[]) {
  return {
    article: {
      upsertCalls: [] as Array<{ where: { normalizedUrl: string } }>,
      async upsert(args: { where: { normalizedUrl: string } }) {
        calls.push('article.upsert');
        this.upsertCalls.push(args);
        return { id: 'article_1' };
      },
    },
    articleLabel: {
      upsertCalls: [] as Array<{
        create: {
          status: ArticleProcessingStatus;
          preFilterReason?: string;
        };
      }>,
      async upsert(args: {
        create: {
          status: ArticleProcessingStatus;
          preFilterReason?: string;
        };
      }) {
        calls.push(`articleLabel.upsert:${args.create.status}`);
        this.upsertCalls.push(args);
        return { id: 'label_1' };
      },
    },
    feed: {
      async findFirst() {
        calls.push('feed.findFirst');
        return {
          id: 'feed_1',
          userId: 'user_1',
          url: 'https://example.com/rss.xml',
        };
      },
      async update(args: { data: { status: FeedStatus } }) {
        calls.push(`feed.update:${args.data.status}`);
        return { id: 'feed_1' };
      },
    },
    feedArticle: {
      async upsert() {
        calls.push('feedArticle.upsert');
        return { id: 'feed_article_1' };
      },
    },
  };
}

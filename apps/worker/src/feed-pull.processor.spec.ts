import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ArticleProcessingStatus, FeedStatus } from './prisma-enums.js';
import {
  pullFeedJob,
  scheduleFeedPullsJob,
} from './feed-pull.processor.js';

describe('scheduleFeedPullsJob', () => {
  it('enqueues one deduplicated pull job for each active feed', async () => {
    const calls: string[] = [];
    const enqueued: Array<{
      options: {
        deduplication?: {
          id: string;
          keepLastIfActive?: boolean;
        };
      };
      payload: {
        feedId: string;
        userId: string;
      };
    }> = [];

    await scheduleFeedPullsJob({
      database: createScheduleDatabaseDouble(calls),
      enqueueFeedPull: async (payload, options = {}) => {
        calls.push(`feedPull.enqueue:${payload.feedId}`);
        enqueued.push({ options, payload });
      },
    });

    assert.deepEqual(calls, [
      'feed.findMany:ACTIVE',
      'feedPull.enqueue:feed_1',
      'feedPull.enqueue:feed_2',
    ]);
    assert.deepEqual(enqueued, [
      {
        payload: {
          feedId: 'feed_1',
          userId: 'user_1',
        },
        options: {
          deduplication: {
            id: 'feed-pull:feed_1',
            keepLastIfActive: true,
          },
        },
      },
      {
        payload: {
          feedId: 'feed_2',
          userId: 'user_2',
        },
        options: {
          deduplication: {
            id: 'feed-pull:feed_2',
            keepLastIfActive: true,
          },
        },
      },
    ]);
  });

  it('does not enqueue seeded demo feeds for live pulling', async () => {
    const calls: string[] = [];
    const enqueued: unknown[] = [];

    await scheduleFeedPullsJob({
      database: createScheduleDatabaseDouble(calls, [
        {
          id: 'feed_1',
          userId: 'user_1',
          url: 'https://demo.news-intelligence.local/techpulse.xml',
        },
        {
          id: 'feed_2',
          userId: 'user_2',
          url: 'https://example.com/rss.xml',
        },
      ]),
      enqueueFeedPull: async (payload) => {
        calls.push(`feedPull.enqueue:${payload.feedId}`);
        enqueued.push(payload);
      },
    });

    assert.deepEqual(calls, [
      'feed.findMany:ACTIVE',
      'feedPull.enqueue:feed_2',
    ]);
    assert.deepEqual(enqueued, [
      {
        feedId: 'feed_2',
        userId: 'user_2',
      },
    ]);
  });

  it('fails loudly when feed pull enqueueing is not wired', async () => {
    await assert.rejects(
      scheduleFeedPullsJob({
        database: createScheduleDatabaseDouble([]),
      }),
      /Feed pull enqueue dependency is required/,
    );
  });
});

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

  it('clears stale analysis when a pulled article becomes filtered', async () => {
    const calls: string[] = [];
    const database = createDatabaseDouble(calls, {
      existingMentions: ['entity_microsoft', 'entity_azure_ai'],
    });

    await pullFeedJob(
      {
        database,
        enqueueArticleProcessing: async () => {
          throw new Error('Filtered articles should not be enqueued.');
        },
        parseFeed: async () => ({
          title: 'Tech Feed',
          items: [
            {
              title: 'Tiny replacement',
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
    assert.ok(calls.includes('articleLabel.upsert:FILTERED:cleared'));
    assert.ok(calls.includes('articleCategoryAssignment.deleteMany'));
    assert.ok(calls.includes('articleAxisAssignment.deleteMany'));
    assert.ok(calls.includes('articleEntityMention.deleteMany'));
    assert.ok(
      calls.includes(
        'graphEdge.deleteMany:MENTIONS:article:article_1->entity:entity_microsoft',
      ),
    );
    assert.ok(
      calls.includes(
        'graphEdge.deleteMany:CO_MENTION:entity:entity_azure_ai->entity:entity_microsoft',
      ),
    );
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

  it('keeps seeded demo feeds active without making a network pull', async () => {
    const calls: string[] = [];
    const database = createDatabaseDouble(calls, {
      url: 'https://demo.news-intelligence.local/techpulse.xml',
    });
    let parseCalls = 0;

    await pullFeedJob(
      {
        database,
        parseFeed: async () => {
          parseCalls += 1;
          throw new Error('demo feed should not be parsed');
        },
      },
      {
        feedId: 'feed_1',
        userId: 'user_1',
      },
    );

    assert.deepEqual(calls, ['feed.findFirst', 'feed.update:ACTIVE']);
    assert.equal(parseCalls, 0);
  });
});

function createDatabaseDouble(
  calls: string[],
  feed: {
    existingMentions?: string[];
    url?: string;
  } = {},
) {
  const mentionRecords = (feed.existingMentions ?? []).map((entityId) => ({
    articleLabelId: 'label_1',
    entityId,
  }));

  return {
    articleAxisAssignment: {
      async deleteMany() {
        calls.push('articleAxisAssignment.deleteMany');
        return { count: 0 };
      },
    },
    articleCategoryAssignment: {
      async deleteMany() {
        calls.push('articleCategoryAssignment.deleteMany');
        return { count: 0 };
      },
    },
    articleEntityMention: {
      async deleteMany() {
        calls.push('articleEntityMention.deleteMany');
        mentionRecords.length = 0;
        return { count: 0 };
      },
      async findMany() {
        calls.push('articleEntityMention.findMany');
        return mentionRecords;
      },
    },
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
        update: {
          importance?: null;
          llmCacheId?: null;
          preFilterReason?: string;
          processedAt?: null;
          status: ArticleProcessingStatus;
          summary?: null;
        };
      }>,
      async upsert(args: {
        create: {
          status: ArticleProcessingStatus;
          preFilterReason?: string;
        };
        update: {
          importance?: null;
          llmCacheId?: null;
          preFilterReason?: string;
          processedAt?: null;
          status: ArticleProcessingStatus;
          summary?: null;
        };
      }) {
        calls.push(`articleLabel.upsert:${args.create.status}`);
        if (
          args.update.status === ArticleProcessingStatus.FILTERED &&
          args.update.importance === null &&
          args.update.llmCacheId === null &&
          args.update.processedAt === null &&
          args.update.summary === null
        ) {
          calls.push('articleLabel.upsert:FILTERED:cleared');
        }
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
          url: feed.url ?? 'https://example.com/rss.xml',
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
    graphEdge: {
      async deleteMany(args: {
        where: {
          fromNodeId?: string;
          kind?: string;
          toNodeId?: string;
        };
      }) {
        calls.push(
          `graphEdge.deleteMany:${args.where.kind}:${args.where.fromNodeId}->${args.where.toNodeId}`,
        );
        return { count: 1 };
      },
      async updateMany(args: {
        data: {
          weight: number;
        };
        where: {
          fromNodeId?: string;
          kind?: string;
          toNodeId?: string;
        };
      }) {
        calls.push(
          `graphEdge.updateMany:${args.where.kind}:${args.where.fromNodeId}->${args.where.toNodeId}:${args.data.weight}`,
        );
        return { count: 1 };
      },
    },
  };
}

function createScheduleDatabaseDouble(
  calls: string[],
  feeds: Array<{
    id: string;
    userId: string;
    url: string;
  }> = [
    {
      id: 'feed_1',
      userId: 'user_1',
      url: 'https://example.com/feed-1.xml',
    },
    {
      id: 'feed_2',
      userId: 'user_2',
      url: 'https://example.com/feed-2.xml',
    },
  ],
) {
  return {
    articleAxisAssignment: {
      async deleteMany() {
        throw new Error('Not used by scheduled feed pulls.');
      },
    },
    articleCategoryAssignment: {
      async deleteMany() {
        throw new Error('Not used by scheduled feed pulls.');
      },
    },
    articleEntityMention: {
      async deleteMany() {
        throw new Error('Not used by scheduled feed pulls.');
      },
      async findMany() {
        throw new Error('Not used by scheduled feed pulls.');
      },
    },
    article: {
      async upsert() {
        throw new Error('Not used by scheduled feed pulls.');
      },
    },
    articleLabel: {
      async upsert() {
        throw new Error('Not used by scheduled feed pulls.');
      },
    },
    feed: {
      async findMany(args: { where: { status: FeedStatus } }) {
        calls.push(`feed.findMany:${args.where.status}`);
        return feeds;
      },
      async findFirst() {
        throw new Error('Not used by scheduled feed pulls.');
      },
      async update() {
        throw new Error('Not used by scheduled feed pulls.');
      },
    },
    feedArticle: {
      async upsert() {
        throw new Error('Not used by scheduled feed pulls.');
      },
    },
    graphEdge: {
      async deleteMany() {
        throw new Error('Not used by scheduled feed pulls.');
      },
      async updateMany() {
        throw new Error('Not used by scheduled feed pulls.');
      },
    },
  };
}

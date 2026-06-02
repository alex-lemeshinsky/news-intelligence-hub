import { ArticleImportance, ArticleProcessingStatus } from '@prisma/client';
import { ArticlesService } from './articles.service';

describe('ArticlesService', () => {
  const findLabels = jest.fn<Promise<unknown[]>, [FindLabelsArgs]>();
  const findLabel = jest.fn<
    Promise<Record<string, unknown> | null>,
    [Record<string, unknown>]
  >();

  const database = {
    articleLabel: {
      findFirst: findLabel,
      findMany: findLabels,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds tenant-scoped article filters for feed, category, status, importance, and time window', async () => {
    findLabels.mockResolvedValue([]);
    const service = new ArticlesService(database as never);

    await service.list('user_1', {
      categoryId: 'cat_1',
      feedId: 'feed_1',
      importance: ArticleImportance.HIGH,
      status: ArticleProcessingStatus.PROCESSED,
      timeWindow: '7d',
    });

    const call = findLabels.mock.calls[0]?.[0];

    expect(call).toBeDefined();
    if (!call) {
      throw new Error('Expected articleLabel.findMany to be called.');
    }

    expect(call.orderBy).toEqual([
      { article: { publishedAt: 'desc' } },
      { createdAt: 'desc' },
    ]);
    expect(call.where.categories).toEqual({
      some: { categoryId: 'cat_1' },
    });
    expect(call.where.importance).toBe(ArticleImportance.HIGH);
    expect(call.where.status).toBe(ArticleProcessingStatus.PROCESSED);
    expect(call.where.userId).toBe('user_1');
    expect(call.where.article.feedItems.some).toEqual({
      feed: { userId: 'user_1' },
      feedId: 'feed_1',
    });
    expect(call.where.article.publishedAt.gte).toBeInstanceOf(Date);
  });

  it('maps labels into article feed cards with duplicate counters', async () => {
    findLabels.mockResolvedValue([
      {
        article: {
          canonicalUrl: 'https://example.com/article',
          feedItems: [
            {
              feed: {
                id: 'feed_1',
                title: 'Primary Feed',
                url: 'https://feed',
              },
              originalUrl: 'https://example.com/article',
            },
            {
              feed: { id: 'feed_2', title: null, url: 'https://other' },
              originalUrl: 'https://example.com/article?copy=1',
            },
          ],
          id: 'article_1',
          normalizedUrl: 'https://example.com/article',
          publishedAt: new Date('2026-05-27T10:00:00.000Z'),
          similaritySource: [{ id: 'sim_1' }],
          similarityTarget: [],
          title: 'Microsoft ships AI runtime',
        },
        axes: [{ axis: { name: 'Reader level' }, value: 'Technical' }],
        categories: [{ category: { id: 'cat_1', name: 'AI infrastructure' } }],
        id: 'label_1',
        importance: ArticleImportance.HIGH,
        mentions: [
          {
            entity: {
              canonicalName: 'Microsoft',
              id: 'entity_1',
              type: 'COMPANY',
            },
          },
        ],
        preFilterReason: null,
        status: ArticleProcessingStatus.PROCESSED,
        summary: 'Microsoft shipped a runtime.',
      },
    ]);
    const service = new ArticlesService(database as never);

    const result = await service.list('user_1', {});

    expect(result.items).toEqual([
      expect.objectContaining({
        categories: [{ id: 'cat_1', name: 'AI infrastructure' }],
        duplicateCount: 1,
        entities: [{ id: 'entity_1', name: 'Microsoft', type: 'COMPANY' }],
        id: 'label_1',
        similarCount: 2,
        sourceTitle: 'Primary Feed',
      }),
    ]);
  });

  it('returns tenant-scoped article detail with duplicate sources and similar articles', async () => {
    findLabel.mockResolvedValue({
      article: {
        canonicalUrl: 'https://example.com/article',
        feedItems: [
          {
            feed: {
              id: 'feed_1',
              title: 'Primary Feed',
              url: 'https://feed',
            },
            originalUrl: 'https://example.com/article',
            pulledAt: new Date('2026-05-27T10:05:00.000Z'),
          },
          {
            feed: { id: 'feed_2', title: null, url: 'https://other' },
            originalUrl: 'https://example.com/article?copy=1',
            pulledAt: new Date('2026-05-27T10:10:00.000Z'),
          },
        ],
        id: 'article_1',
        normalizedUrl: 'https://example.com/article',
        publishedAt: new Date('2026-05-27T10:00:00.000Z'),
        similaritySource: [
          {
            id: 'sim_1',
            kind: 'EXACT_CONTENT',
            score: null,
            similarArticle: {
              id: 'article_2',
              labels: [
                {
                  id: 'label_2',
                  importance: ArticleImportance.NORMAL,
                  summary: 'Related article summary.',
                },
              ],
              publishedAt: new Date('2026-05-27T11:00:00.000Z'),
              title: 'Related AI runtime coverage',
            },
          },
        ],
        similarityTarget: [],
        title: 'Microsoft ships AI runtime',
      },
      axes: [
        {
          axis: { id: 'axis_1', name: 'Reader level' },
          value: 'Technical',
        },
      ],
      categories: [{ category: { id: 'cat_1', name: 'AI infrastructure' } }],
      id: 'label_1',
      importance: ArticleImportance.HIGH,
      mentions: [
        {
          entity: {
            canonicalName: 'Microsoft',
            id: 'entity_1',
            type: 'COMPANY',
          },
        },
      ],
      preFilterReason: null,
      status: ArticleProcessingStatus.PROCESSED,
      summary: 'Microsoft shipped a runtime.',
    });
    const service = new ArticlesService(database as never);

    const detail = await service.getDetail('user_1', 'label_1');
    const call = findLabel.mock.calls[0]?.[0];

    expect(call?.where).toEqual({ id: 'label_1', userId: 'user_1' });
    expect(detail).toEqual(
      expect.objectContaining({
        duplicateCount: 1,
        id: 'label_1',
        similarCount: 2,
        title: 'Microsoft ships AI runtime',
      }),
    );
    expect(detail.duplicateSources).toEqual([
      expect.objectContaining({
        feedId: 'feed_1',
        originalUrl: 'https://example.com/article',
        sourceTitle: 'Primary Feed',
      }),
      expect.objectContaining({
        feedId: 'feed_2',
        sourceTitle: 'https://other',
      }),
    ]);
    expect(detail.similarArticles).toEqual([
      expect.objectContaining({
        articleId: 'article_2',
        articleLabelId: 'label_2',
        title: 'Related AI runtime coverage',
      }),
    ]);
  });

  it('rejects article detail access for labels outside the current user scope', async () => {
    findLabel.mockResolvedValue(null);
    const service = new ArticlesService(database as never);

    await expect(
      service.getDetail('user_1', 'label_from_other_user'),
    ).rejects.toThrow('Article was not found.');
  });
});

interface FindLabelsArgs {
  orderBy: unknown[];
  where: {
    categories: { some: { categoryId: string } };
    importance: ArticleImportance;
    status: ArticleProcessingStatus;
    userId: string;
    article: {
      feedItems: { some: { feedId: string; feed: { userId: string } } };
      publishedAt: { gte: Date };
    };
  };
}

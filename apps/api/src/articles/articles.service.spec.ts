import { ArticleImportance, ArticleProcessingStatus } from '@prisma/client';
import { ArticlesService } from './articles.service';

describe('ArticlesService', () => {
  const findLabels = jest.fn();

  const database = {
    articleLabel: {
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

    expect(findLabels).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ article: { publishedAt: 'desc' } }, { createdAt: 'desc' }],
        where: expect.objectContaining({
          categories: { some: { categoryId: 'cat_1' } },
          importance: ArticleImportance.HIGH,
          status: ArticleProcessingStatus.PROCESSED,
          userId: 'user_1',
        }),
      }),
    );
    const call = findLabels.mock.calls[0]?.[0] as {
      where: {
        article: {
          feedItems: { some: { feedId: string; feed: { userId: string } } };
          publishedAt: { gte: Date };
        };
      };
    };
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
              feed: { id: 'feed_1', title: 'Primary Feed', url: 'https://feed' },
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
        entities: [
          { id: 'entity_1', name: 'Microsoft', type: 'COMPANY' },
        ],
        id: 'label_1',
        similarCount: 2,
        sourceTitle: 'Primary Feed',
      }),
    ]);
  });
});

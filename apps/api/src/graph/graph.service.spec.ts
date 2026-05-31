import { ArticleImportance, GraphEdgeKind } from '@prisma/client';
import { GraphService } from './graph.service';

describe('GraphService', () => {
  const findLabels = jest.fn<Promise<unknown[]>, [Record<string, unknown>]>();
  const findEdges = jest.fn<Promise<unknown[]>, [Record<string, unknown>]>();

  const database = {
    articleLabel: {
      findMany: findLabels,
    },
    graphEdge: {
      findMany: findEdges,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tenant-scoped graph nodes and typed edges from processed labels', async () => {
    findLabels.mockResolvedValue([
      {
        article: {
          id: 'article_1',
          publishedAt: new Date('2026-05-31T07:00:00.000Z'),
          title: 'Microsoft ships Azure AI runtime update',
        },
        categories: [{ category: { id: 'cat_ai', name: 'AI infrastructure' } }],
        id: 'label_1',
        importance: ArticleImportance.HIGH,
        mentions: [
          {
            entity: {
              aliases: ['MSFT'],
              canonicalName: 'Microsoft',
              description: 'Cloud platform company.',
              firstSeen: 1_780_000_000,
              id: 'entity_ms',
              lastSeen: 1_780_214_400,
              type: 'COMPANY',
            },
          },
          {
            entity: {
              aliases: [],
              canonicalName: 'Azure AI runtime',
              description: 'AI runtime product.',
              firstSeen: 1_780_214_400,
              id: 'entity_azure',
              lastSeen: 1_780_214_400,
              type: 'PRODUCT',
            },
          },
        ],
        status: 'PROCESSED',
        summary: 'Microsoft shipped an Azure AI runtime update.',
      },
    ]);
    findEdges.mockResolvedValue([
      {
        categoryId: 'cat_ai',
        fromNodeId: 'article:article_1',
        id: 'edge_mentions_ms',
        kind: GraphEdgeKind.MENTIONS,
        score: null,
        toNodeId: 'entity:entity_ms',
        ts: 1_780_214_400,
        weight: 1,
      },
      {
        categoryId: 'cat_ai',
        fromNodeId: 'entity:entity_azure',
        id: 'edge_co',
        kind: GraphEdgeKind.CO_MENTION,
        score: null,
        toNodeId: 'entity:entity_ms',
        ts: 1_780_214_400,
        weight: 1,
      },
    ]);
    const service = new GraphService(database as never);

    const graph = await service.getGraph('user_1', { categoryId: 'cat_ai' });
    const labelCall = findLabels.mock.calls[0]?.[0];

    expect(labelCall?.where).toMatchObject({
      categories: { some: { categoryId: 'cat_ai' } },
      status: 'PROCESSED',
      userId: 'user_1',
    });
    expect(findEdges).toHaveBeenCalledWith({
      orderBy: [{ kind: 'asc' }, { weight: 'desc' }],
      where: {
        categoryId: 'cat_ai',
        userId: 'user_1',
      },
    });
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'article:article_1',
          kind: 'article',
          label: 'Microsoft ships Azure AI runtime update',
        }),
        expect.objectContaining({
          entityType: 'COMPANY',
          id: 'entity:entity_ms',
          kind: 'entity',
          label: 'Microsoft',
        }),
      ]),
    );
    expect(graph.edges).toEqual([
      expect.objectContaining({
        fromNodeId: 'article:article_1',
        kind: 'mentions',
        toNodeId: 'entity:entity_ms',
      }),
      expect.objectContaining({
        fromNodeId: 'entity:entity_azure',
        kind: 'co_mention',
        toNodeId: 'entity:entity_ms',
        weight: 1,
      }),
    ]);
  });

  it('filters returned graph nodes by requested node kind', async () => {
    findLabels.mockResolvedValue([
      {
        article: {
          id: 'article_1',
          publishedAt: null,
          title: 'Microsoft ships Azure AI runtime update',
        },
        categories: [],
        id: 'label_1',
        importance: null,
        mentions: [
          {
            entity: {
              aliases: [],
              canonicalName: 'Microsoft',
              description: null,
              firstSeen: null,
              id: 'entity_ms',
              lastSeen: null,
              type: 'COMPANY',
            },
          },
        ],
        status: 'PROCESSED',
        summary: null,
      },
    ]);
    findEdges.mockResolvedValue([]);
    const service = new GraphService(database as never);

    const graph = await service.getGraph('user_1', { nodeKind: 'entity' });

    expect(graph.nodes).toEqual([
      expect.objectContaining({
        id: 'entity:entity_ms',
        kind: 'entity',
      }),
    ]);
    expect(graph.edges).toEqual([]);
  });
});

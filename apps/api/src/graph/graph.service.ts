import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ArticleImportance,
  ArticleProcessingStatus,
  EntityType,
  GraphEdgeKind,
} from '@prisma/client';
import { DatabaseService } from '../database/database.service';

const MAX_CO_MENTION_EDGES = 300;

@Injectable()
export class GraphService {
  constructor(private readonly database: DatabaseService) {}

  async getGraph(userId: string, filters: GraphFilters): Promise<GraphData> {
    const labels = await this.database.articleLabel.findMany({
      include: {
        article: true,
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
      where: buildLabelWhere(userId, filters),
    });
    const nodeMap = new Map<string, GraphNode>();

    for (const label of labels as ArticleLabelRecord[]) {
      const categorySummaries = label.categories.map((assignment) => ({
        id: assignment.category.id,
        name: assignment.category.name,
      }));
      const articleNodeId = articleNodeIdFor(label.article.id);

      nodeMap.set(articleNodeId, {
        articleId: label.article.id,
        articleLabelId: label.id,
        categories: categorySummaries,
        id: articleNodeId,
        importance: label.importance,
        kind: 'article',
        label: label.article.title,
        publishedAt: label.article.publishedAt?.toISOString() ?? null,
        summary: label.summary,
        timestamp: timestampSeconds(label.article.publishedAt),
      });

      for (const mention of label.mentions) {
        const entityNodeId = entityNodeIdFor(mention.entity.id);
        const existingNode = nodeMap.get(entityNodeId) as
          | EntityGraphNode
          | undefined;

        nodeMap.set(entityNodeId, {
          aliases: mention.entity.aliases,
          articleCount: (existingNode?.articleCount ?? 0) + 1,
          description: mention.entity.description,
          entityId: mention.entity.id,
          entityType: mention.entity.type,
          firstSeen: mention.entity.firstSeen,
          id: entityNodeId,
          kind: 'entity',
          label: mention.entity.canonicalName,
          lastSeen: mention.entity.lastSeen,
        });
      }
    }

    const filteredNodes = filterNodes([...nodeMap.values()], filters);
    const visibleNodeIds = new Set(filteredNodes.map((node) => node.id));
    const graphEdges = await this.database.graphEdge.findMany({
      orderBy: [{ kind: 'asc' }, { weight: 'desc' }],
      where: buildEdgeWhere(userId, filters),
    });
    const edges = limitDenseEdges(
      (graphEdges as GraphEdgeRecord[]).filter(
        (edge) =>
          visibleNodeIds.has(edge.fromNodeId) &&
          visibleNodeIds.has(edge.toNodeId),
      ),
    ).map(mapGraphEdge);

    return {
      edges,
      nodes: filteredNodes,
    };
  }

  async getEntityDetail(
    userId: string,
    entityId: string,
  ): Promise<EntityDetail> {
    const entity = await this.database.entity.findFirst({
      include: {
        mentions: {
          include: {
            articleLabel: {
              include: {
                article: true,
                categories: {
                  include: {
                    category: true,
                  },
                },
              },
            },
          },
          where: {
            articleLabel: {
              userId,
            },
          },
        },
      },
      where: {
        id: entityId,
        userId,
      },
    });

    if (!entity) {
      throw new NotFoundException('Entity was not found.');
    }

    const relatedEdges = (await this.database.graphEdge.findMany({
      orderBy: [{ weight: 'desc' }],
      where: {
        OR: [
          { fromNodeId: entityNodeIdFor(entity.id) },
          { toNodeId: entityNodeIdFor(entity.id) },
        ],
        kind: GraphEdgeKind.CO_MENTION,
        userId,
      },
    })) as GraphEdgeRecord[];
    const relatedEntityIds = relatedEdges
      .map((edge) => otherEntityId(edge, entity.id))
      .filter((id): id is string => Boolean(id));
    const relatedEntities =
      relatedEntityIds.length === 0
        ? []
        : ((await this.database.entity.findMany({
            where: {
              id: { in: relatedEntityIds },
              userId,
            },
          })) as RelatedEntityRecord[]);

    return mapEntityDetail(entity, relatedEdges, relatedEntities);
  }
}

export interface GraphFilters {
  categoryId?: string;
  nodeKind?: GraphNodeKind;
  search?: string;
  timeWindow?: '24h' | '7d' | '30d';
}

export interface GraphData {
  edges: GraphEdge[];
  nodes: GraphNode[];
}

export type GraphNodeKind = 'article' | 'entity';

export type GraphNode = ArticleGraphNode | EntityGraphNode;

export interface ArticleGraphNode {
  articleId: string;
  articleLabelId: string;
  categories: Array<{
    id: string;
    name: string;
  }>;
  importance: ArticleImportance | null;
  id: string;
  kind: 'article';
  label: string;
  publishedAt: string | null;
  summary: string | null;
  timestamp: number | null;
}

export interface EntityGraphNode {
  aliases: string[];
  articleCount: number;
  description: string | null;
  entityId: string;
  entityType: EntityType;
  firstSeen: number | null;
  id: string;
  kind: 'entity';
  label: string;
  lastSeen: number | null;
}

export interface GraphEdge {
  categoryId: string | null;
  edgeId: string;
  fromNodeId: string;
  kind: 'mentions' | 'co_mention' | 'similar';
  score: number | null;
  timestamp: number | null;
  toNodeId: string;
  weight: number | null;
}

export interface EntityDetail {
  aliases: string[];
  articleCount: number;
  description: string | null;
  entityId: string;
  entityType: EntityType;
  firstSeen: number | null;
  label: string;
  lastSeen: number | null;
  mentionActivity: Array<{
    count: number;
    date: string;
  }>;
  mentioningArticles: Array<{
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
  }>;
  relatedEntities: Array<{
    description: string | null;
    entityId: string;
    entityType: EntityType;
    label: string;
    weight: number;
  }>;
}

interface ArticleLabelRecord {
  article: {
    id: string;
    publishedAt: Date | null;
    title: string;
  };
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
      aliases: string[];
      canonicalName: string;
      description: string | null;
      firstSeen: number | null;
      id: string;
      lastSeen: number | null;
      type: EntityType;
    };
  }>;
  status: ArticleProcessingStatus;
  summary: string | null;
}

interface GraphEdgeRecord {
  categoryId: string | null;
  fromNodeId: string;
  id: string;
  kind: GraphEdgeKind;
  score: number | null;
  toNodeId: string;
  ts: number | null;
  weight: number | null;
}

interface EntityDetailRecord {
  aliases: string[];
  canonicalName: string;
  description: string | null;
  firstSeen: number | null;
  id: string;
  lastSeen: number | null;
  mentions: Array<{
    articleLabel: {
      article: {
        id: string;
        publishedAt: Date | null;
        title: string;
      };
      categories: Array<{
        category: {
          id: string;
          name: string;
        };
      }>;
      id: string;
      importance: ArticleImportance | null;
      processedAt: Date | null;
      summary: string | null;
    };
  }>;
  type: EntityType;
}

interface RelatedEntityRecord {
  canonicalName: string;
  description: string | null;
  id: string;
  type: EntityType;
}

function buildLabelWhere(userId: string, filters: GraphFilters) {
  const where: Record<string, unknown> = {
    status: ArticleProcessingStatus.PROCESSED,
    userId,
  };

  if (filters.categoryId) {
    where.categories = {
      some: {
        categoryId: filters.categoryId,
      },
    };
  }

  const articleWhere: Record<string, unknown> = {};
  const publishedAfter = timeWindowStart(filters.timeWindow);
  if (publishedAfter) {
    articleWhere.publishedAt = {
      gte: publishedAfter,
    };
  }

  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      {
        summary: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        article: {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        mentions: {
          some: {
            entity: {
              canonicalName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          },
        },
      },
    ];
  }

  if (Object.keys(articleWhere).length > 0) {
    where.article = articleWhere;
  }

  return where;
}

function buildEdgeWhere(userId: string, filters: GraphFilters) {
  const where: Record<string, unknown> = { userId };

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  return where;
}

function filterNodes(nodes: GraphNode[], filters: GraphFilters): GraphNode[] {
  if (!filters.nodeKind) {
    return nodes;
  }

  return nodes.filter((node) => node.kind === filters.nodeKind);
}

function limitDenseEdges(edges: GraphEdgeRecord[]): GraphEdgeRecord[] {
  let coMentionCount = 0;
  const limitedEdges: GraphEdgeRecord[] = [];

  for (const edge of edges) {
    if (edge.kind === GraphEdgeKind.CO_MENTION) {
      if (coMentionCount >= MAX_CO_MENTION_EDGES) {
        continue;
      }
      coMentionCount += 1;
    }

    limitedEdges.push(edge);
  }

  return limitedEdges;
}

function mapGraphEdge(edge: GraphEdgeRecord): GraphEdge {
  return {
    categoryId: edge.categoryId,
    edgeId: edge.id,
    fromNodeId: edge.fromNodeId,
    kind: mapEdgeKind(edge.kind),
    score: edge.score,
    timestamp: edge.ts,
    toNodeId: edge.toNodeId,
    weight: edge.weight,
  };
}

function mapEntityDetail(
  entity: EntityDetailRecord,
  relatedEdges: GraphEdgeRecord[],
  relatedEntities: RelatedEntityRecord[],
): EntityDetail {
  const relatedById = new Map(relatedEntities.map((item) => [item.id, item]));
  const mentioningArticles = entity.mentions.map((mention) => {
    const label = mention.articleLabel;
    return {
      articleId: label.article.id,
      articleLabelId: label.id,
      categories: label.categories.map((assignment) => ({
        id: assignment.category.id,
        name: assignment.category.name,
      })),
      importance: label.importance,
      publishedAt: label.article.publishedAt?.toISOString() ?? null,
      summary: label.summary,
      title: label.article.title,
    };
  });

  return {
    aliases: entity.aliases,
    articleCount: mentioningArticles.length,
    description: entity.description,
    entityId: entity.id,
    entityType: entity.type,
    firstSeen: entity.firstSeen,
    label: entity.canonicalName,
    lastSeen: entity.lastSeen,
    mentionActivity: buildMentionActivity(entity.mentions),
    mentioningArticles,
    relatedEntities: relatedEdges.flatMap((edge) => {
      const relatedId = otherEntityId(edge, entity.id);
      const related = relatedId ? relatedById.get(relatedId) : undefined;
      if (!related) {
        return [];
      }

      return [
        {
          description: related.description,
          entityId: related.id,
          entityType: related.type,
          label: related.canonicalName,
          weight: edge.weight ?? 0,
        },
      ];
    }),
  };
}

function buildMentionActivity(
  mentions: EntityDetailRecord['mentions'],
): EntityDetail['mentionActivity'] {
  const counts = new Map<string, number>();

  for (const mention of mentions) {
    const date = (
      mention.articleLabel.article.publishedAt ??
      mention.articleLabel.processedAt
    )
      ?.toISOString()
      .slice(0, 10);
    if (!date) {
      continue;
    }

    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ count, date }));
}

function mapEdgeKind(
  kind: GraphEdgeKind,
): 'mentions' | 'co_mention' | 'similar' {
  if (kind === GraphEdgeKind.CO_MENTION) {
    return 'co_mention';
  }
  if (kind === GraphEdgeKind.SIMILAR) {
    return 'similar';
  }
  return 'mentions';
}

function articleNodeIdFor(articleId: string): string {
  return `article:${articleId}`;
}

function entityNodeIdFor(entityId: string): string {
  return `entity:${entityId}`;
}

function otherEntityId(edge: GraphEdgeRecord, entityId: string): string | null {
  const selectedNodeId = entityNodeIdFor(entityId);
  const otherNodeId =
    edge.fromNodeId === selectedNodeId ? edge.toNodeId : edge.fromNodeId;

  return otherNodeId.startsWith('entity:')
    ? otherNodeId.slice('entity:'.length)
    : null;
}

function timestampSeconds(value: Date | null): number | null {
  return value ? Math.floor(value.getTime() / 1000) : null;
}

function timeWindowStart(timeWindow: GraphFilters['timeWindow']) {
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

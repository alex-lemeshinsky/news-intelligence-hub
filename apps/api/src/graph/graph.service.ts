import { Injectable } from '@nestjs/common';
import {
  ArticleImportance,
  ArticleProcessingStatus,
  EntityType,
  GraphEdgeKind,
} from '@prisma/client';
import { DatabaseService } from '../database/database.service';

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
    const edges = (graphEdges as GraphEdgeRecord[])
      .filter(
        (edge) =>
          visibleNodeIds.has(edge.fromNodeId) &&
          visibleNodeIds.has(edge.toNodeId),
      )
      .map(mapGraphEdge);

    return {
      edges,
      nodes: filteredNodes,
    };
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

import { GraphEdgeKind } from './prisma-enums.js';

export interface AnalysisCleanupDatabase {
  articleAxisAssignment: {
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
  };
  articleCategoryAssignment: {
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
  };
  articleEntityMention: {
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
    findMany(args: Record<string, unknown>): Promise<ArticleMentionRecord[]>;
  };
  graphEdge: {
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
    updateMany(args: Record<string, unknown>): Promise<unknown>;
  };
}

interface ArticleMentionRecord {
  articleLabelId: string;
  entityId: string;
}

export async function clearArticleAnalysis(
  database: AnalysisCleanupDatabase,
  label: {
    articleId: string;
    articleLabelId: string;
    userId: string;
  },
): Promise<void> {
  const previousEntityIds = await findMentionEntityIds(
    database,
    label.articleLabelId,
  );

  await database.articleCategoryAssignment.deleteMany({
    where: { articleLabelId: label.articleLabelId },
  });
  await database.articleAxisAssignment.deleteMany({
    where: { articleLabelId: label.articleLabelId },
  });
  await database.articleEntityMention.deleteMany({
    where: { articleLabelId: label.articleLabelId },
  });

  const articleNodeId = `article:${label.articleId}`;
  for (const entityId of previousEntityIds) {
    await deleteGraphEdge(database, {
      fromNodeId: articleNodeId,
      kind: GraphEdgeKind.MENTIONS,
      toNodeId: `entity:${entityId}`,
      userId: label.userId,
    });
  }

  for (const pairKey of entityPairKeys(previousEntityIds)) {
    const [leftEntityId, rightEntityId] = pairKey.split('|');
    const [fromNodeId, toNodeId] = [
      `entity:${leftEntityId}`,
      `entity:${rightEntityId}`,
    ].sort();
    const weight = await countCoMentionedArticles(
      database,
      leftEntityId,
      rightEntityId,
    );

    if (weight <= 0) {
      await deleteGraphEdge(database, {
        fromNodeId,
        kind: GraphEdgeKind.CO_MENTION,
        toNodeId,
        userId: label.userId,
      });
      continue;
    }

    await database.graphEdge.updateMany({
      data: { weight },
      where: {
        fromNodeId,
        kind: GraphEdgeKind.CO_MENTION,
        toNodeId,
        userId: label.userId,
      },
    });
  }
}

async function findMentionEntityIds(
  database: AnalysisCleanupDatabase,
  articleLabelId: string,
): Promise<string[]> {
  const mentions = await database.articleEntityMention.findMany({
    select: { entityId: true },
    where: { articleLabelId },
  });
  return [...new Set(mentions.map((mention) => mention.entityId))];
}

async function countCoMentionedArticles(
  database: AnalysisCleanupDatabase,
  leftEntityId: string,
  rightEntityId: string,
): Promise<number> {
  const mentions = await database.articleEntityMention.findMany({
    select: {
      articleLabelId: true,
      entityId: true,
    },
    where: {
      entityId: { in: [leftEntityId, rightEntityId] },
    },
  });
  const mentionsByLabel = new Map<string, Set<string>>();

  for (const mention of mentions) {
    const entityIds =
      mentionsByLabel.get(mention.articleLabelId) ?? new Set<string>();
    entityIds.add(mention.entityId);
    mentionsByLabel.set(mention.articleLabelId, entityIds);
  }

  return [...mentionsByLabel.values()].filter(
    (entityIds) =>
      entityIds.has(leftEntityId) && entityIds.has(rightEntityId),
  ).length;
}

async function deleteGraphEdge(
  database: AnalysisCleanupDatabase,
  edge: {
    fromNodeId: string;
    kind: GraphEdgeKind;
    toNodeId: string;
    userId: string;
  },
): Promise<void> {
  await database.graphEdge.deleteMany({
    where: {
      fromNodeId: edge.fromNodeId,
      kind: edge.kind,
      toNodeId: edge.toNodeId,
      userId: edge.userId,
    },
  });
}

function entityPairKeys(entityIds: string[]): Set<string> {
  const uniqueIds = [...new Set(entityIds)];
  const pairKeys = new Set<string>();

  for (let leftIndex = 0; leftIndex < uniqueIds.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < uniqueIds.length;
      rightIndex += 1
    ) {
      pairKeys.add(
        [uniqueIds[leftIndex], uniqueIds[rightIndex]].sort().join('|'),
      );
    }
  }

  return pairKeys;
}

import { createHash } from 'crypto';
import { ArticleProcessingJobData } from '@nih/shared';
import {
  ArticleAnalysis,
  ArticleAnalysisEntity,
  LlmArticleAnalysisResponse,
  LlmArticleAnalyzer,
  validateArticleAnalysis,
} from './llm-client.js';
import {
  ArticleProcessingStatus,
  GraphEdgeKind,
  LlmOperation,
  LlmProvider,
} from './prisma-enums.js';

export interface ArticleProcessingDependencies {
  database: ArticleProcessingDatabase;
  llm: LlmArticleAnalyzer;
}

export interface ArticleProcessingDatabase {
  articleAxisAssignment: {
    createMany(args: Record<string, unknown>): Promise<unknown>;
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
  };
  articleCategoryAssignment: {
    createMany(args: Record<string, unknown>): Promise<unknown>;
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
  };
  articleEntityMention: {
    createMany(args: Record<string, unknown>): Promise<unknown>;
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
    findMany(args: Record<string, unknown>): Promise<ArticleMentionRecord[]>;
  };
  articleLabel: {
    findFirst(args: Record<string, unknown>): Promise<ArticleLabelRecord | null>;
    update(args: Record<string, unknown>): Promise<unknown>;
  };
  category: {
    findMany(args: Record<string, unknown>): Promise<CategoryRecord[]>;
  };
  classificationAxis: {
    findMany(args: Record<string, unknown>): Promise<ClassificationAxisRecord[]>;
  };
  entity: {
    create(args: Record<string, unknown>): Promise<EntityRecord>;
    findFirst(args: Record<string, unknown>): Promise<EntityRecord | null>;
    update(args: Record<string, unknown>): Promise<EntityRecord>;
  };
  graphEdge: {
    upsert(args: Record<string, unknown>): Promise<unknown>;
  };
  llmCache: {
    create(args: Record<string, unknown>): Promise<LlmCacheRecord>;
    findUnique(args: Record<string, unknown>): Promise<LlmCacheRecord | null>;
  };
  llmTelemetry: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
}

interface ArticleLabelRecord {
  article: {
    contentHash: string;
    extractedText: string | null;
    id: string;
    publishedAt: Date | null;
    title: string;
  };
  articleId: string;
  id: string;
  status: string;
  userId: string;
}

interface CategoryRecord {
  id: string;
  name: string;
}

interface ClassificationAxisRecord {
  id: string;
  name: string;
  values: string[];
}

interface EntityRecord {
  aliases: string[];
  firstSeen?: number | null;
  id: string;
  lastSeen?: number | null;
}

interface ArticleMentionRecord {
  articleLabelId: string;
  entityId: string;
}

interface LlmCacheRecord {
  id: string;
  model: string;
  provider: LlmProvider;
  responseJson: unknown;
}

interface PersistedAnalysisContext {
  assignedAxes: Array<{
    axisId: string;
    value: string;
  }>;
  assignedCategoryIds: string[];
  entities: EntityRecord[];
  label: ArticleLabelRecord;
  result: ArticleAnalysis;
}

export async function processArticleJob(
  dependencies: ArticleProcessingDependencies,
  payload: ArticleProcessingJobData,
): Promise<void> {
  const label = await findProcessableLabel(dependencies.database, payload);
  if (!label) {
    return;
  }

  let llmResponse: LlmArticleAnalysisResponse | null = null;

  try {
    const categories = await dependencies.database.category.findMany({
      orderBy: { name: 'asc' },
      where: { userId: payload.userId },
    });
    const axes = await dependencies.database.classificationAxis.findMany({
      orderBy: { name: 'asc' },
      where: { userId: payload.userId },
    });
    const cacheKey = buildCacheKey(
      label.article.contentHash,
      categories,
      axes,
      dependencies.llm.provider,
      dependencies.llm.model,
    );
    const cached = await dependencies.database.llmCache.findUnique({
      where: { cacheKey },
    });
    const cacheResult = cached
      ? {
          cacheId: cached.id,
          result: validateArticleAnalysis(cached.responseJson),
        }
      : null;
    const analysis = cacheResult?.result;
    const result =
      analysis ??
      validateArticleAnalysis(
        (llmResponse = await dependencies.llm.analyzeArticle({
          axes: axes.map((axis) => ({
            name: axis.name,
            values: axis.values,
          })),
          categories: categories.map((category) => ({ name: category.name })),
          text: label.article.extractedText ?? '',
          title: label.article.title,
        })).result,
      );
    let cacheId = cacheResult?.cacheId;
    if (!cacheId) {
      const cache = await dependencies.database.llmCache.create({
        data: {
          cacheKey,
          completionTokens: llmResponse?.usage.completionTokens ?? 0,
          contentHash: label.article.contentHash,
          model: llmResponse?.model ?? dependencies.llm.model ?? 'unknown',
          operation: LlmOperation.ARTICLE_ANALYSIS,
          promptTokens: llmResponse?.usage.promptTokens ?? 0,
          provider:
            llmResponse?.provider ??
            dependencies.llm.provider ??
            LlmProvider.OPENAI,
          responseJson: result,
          totalTokens: llmResponse?.usage.totalTokens ?? 0,
        },
      });
      cacheId = cache.id;
    }

    const context = await persistAnalysis(dependencies.database, {
      assignedAxes: matchAxisAssignments(result, axes),
      assignedCategoryIds: matchCategoryIds(result.categories, categories),
      entities: await upsertEntities(
        dependencies.database,
        payload.userId,
        result.entities,
        articleTimestampSeconds(label.article.publishedAt),
      ),
      label,
      result,
    });

    await updateGraphEdges(dependencies.database, context);

    await dependencies.database.articleLabel.update({
      data: {
        importance: result.importance,
        llmCacheId: cacheId,
        processedAt: new Date(),
        status: ArticleProcessingStatus.PROCESSED,
        summary: result.summary,
      },
      where: { id: label.id },
    });

    if (llmResponse) {
      await recordTelemetry(dependencies.database, {
        latencyMs: llmResponse.latencyMs,
        model: llmResponse.model,
        provider: llmResponse.provider,
        success: true,
        usage: llmResponse.usage,
        userId: payload.userId,
      });
    }
  } catch (error) {
    await dependencies.database.articleLabel.update({
      data: {
        status: ArticleProcessingStatus.FAILED,
      },
      where: { id: label.id },
    });

    if (llmResponse) {
      await recordTelemetry(dependencies.database, {
        errorCode: getErrorMessage(error),
        latencyMs: llmResponse.latencyMs,
        model: llmResponse.model,
        provider: llmResponse.provider,
        success: false,
        usage: llmResponse.usage,
        userId: payload.userId,
      });
    }

    throw error;
  }
}

async function findProcessableLabel(
  database: ArticleProcessingDatabase,
  payload: ArticleProcessingJobData,
): Promise<ArticleLabelRecord | null> {
  const label = await database.articleLabel.findFirst({
    include: { article: true },
    where: {
      articleId: payload.articleId,
      id: payload.articleLabelId,
      userId: payload.userId,
    },
  });

  if (
    !label ||
    (label.status !== ArticleProcessingStatus.PENDING &&
      label.status !== ArticleProcessingStatus.FAILED)
  ) {
    return null;
  }

  return label;
}

async function persistAnalysis(
  database: ArticleProcessingDatabase,
  context: PersistedAnalysisContext,
): Promise<PersistedAnalysisContext> {
  await database.articleCategoryAssignment.deleteMany({
    where: { articleLabelId: context.label.id },
  });
  await database.articleAxisAssignment.deleteMany({
    where: { articleLabelId: context.label.id },
  });
  await database.articleEntityMention.deleteMany({
    where: { articleLabelId: context.label.id },
  });

  if (context.assignedCategoryIds.length > 0) {
    await database.articleCategoryAssignment.createMany({
      data: context.assignedCategoryIds.map((categoryId) => ({
        articleLabelId: context.label.id,
        categoryId,
      })),
      skipDuplicates: true,
    });
  }

  if (context.assignedAxes.length > 0) {
    await database.articleAxisAssignment.createMany({
      data: context.assignedAxes.map((assignment) => ({
        articleLabelId: context.label.id,
        axisId: assignment.axisId,
        value: assignment.value,
      })),
      skipDuplicates: true,
    });
  }

  if (context.entities.length > 0) {
    await database.articleEntityMention.createMany({
      data: context.entities.map((entity) => ({
        articleLabelId: context.label.id,
        entityId: entity.id,
      })),
      skipDuplicates: true,
    });
  }

  return context;
}

async function upsertEntities(
  database: ArticleProcessingDatabase,
  userId: string,
  entities: ArticleAnalysisEntity[],
  timestamp: number,
): Promise<EntityRecord[]> {
  const persistedEntities: EntityRecord[] = [];

  for (const entity of entities) {
    const existing = await database.entity.findFirst({
      where: {
        OR: [
          {
            canonicalName: {
              equals: entity.name,
              mode: 'insensitive',
            },
          },
          ...entity.aliases.map((alias) => ({
            aliases: { has: alias },
          })),
        ],
        type: entity.type,
        userId,
      },
    });

    if (!existing) {
      persistedEntities.push(
        await database.entity.create({
          data: {
            aliases: entity.aliases,
            canonicalName: entity.name,
            description: entity.description,
            firstSeen: timestamp,
            lastSeen: timestamp,
            type: entity.type,
            userId,
          },
        }),
      );
      continue;
    }

    persistedEntities.push(
      await database.entity.update({
        data: {
          aliases: mergeAliases(existing.aliases, entity.aliases, entity.name),
          description: entity.description,
          firstSeen:
            existing.firstSeen === null || existing.firstSeen === undefined
              ? timestamp
              : Math.min(existing.firstSeen, timestamp),
          lastSeen:
            existing.lastSeen === null || existing.lastSeen === undefined
              ? timestamp
              : Math.max(existing.lastSeen, timestamp),
        },
        where: { id: existing.id },
      }),
    );
  }

  return persistedEntities;
}

async function updateGraphEdges(
  database: ArticleProcessingDatabase,
  context: PersistedAnalysisContext,
): Promise<void> {
  const articleNodeId = `article:${context.label.article.id}`;
  const timestamp = articleTimestampSeconds(context.label.article.publishedAt);
  const primaryCategoryId = context.assignedCategoryIds[0] ?? null;

  for (const entity of context.entities) {
    await upsertGraphEdge(database, {
      categoryId: primaryCategoryId,
      fromNodeId: articleNodeId,
      kind: GraphEdgeKind.MENTIONS,
      score: null,
      timestamp,
      toNodeId: `entity:${entity.id}`,
      userId: context.label.userId,
      weight: 1,
    });
  }

  for (const [left, right] of entityPairs(context.entities)) {
    const [fromNodeId, toNodeId] = [
      `entity:${left.id}`,
      `entity:${right.id}`,
    ].sort();
    await upsertGraphEdge(database, {
      categoryId: primaryCategoryId,
      fromNodeId,
      kind: GraphEdgeKind.CO_MENTION,
      score: null,
      timestamp,
      toNodeId,
      userId: context.label.userId,
      weight: await countCoMentionedArticles(database, left.id, right.id),
    });
  }
}

async function upsertGraphEdge(
  database: ArticleProcessingDatabase,
  edge: {
    categoryId: string | null;
    fromNodeId: string;
    kind: GraphEdgeKind;
    score: number | null;
    timestamp: number;
    toNodeId: string;
    userId: string;
    weight: number;
  },
): Promise<void> {
  await database.graphEdge.upsert({
    create: {
      categoryId: edge.categoryId,
      fromNodeId: edge.fromNodeId,
      kind: edge.kind,
      score: edge.score,
      toNodeId: edge.toNodeId,
      ts: edge.timestamp,
      userId: edge.userId,
      weight: edge.weight,
    },
    update: {
      categoryId: edge.categoryId,
      score: edge.score,
      ts: edge.timestamp,
      weight: edge.weight,
    },
    where: {
      userId_fromNodeId_toNodeId_kind: {
        fromNodeId: edge.fromNodeId,
        kind: edge.kind,
        toNodeId: edge.toNodeId,
        userId: edge.userId,
      },
    },
  });
}

async function countCoMentionedArticles(
  database: ArticleProcessingDatabase,
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

function matchCategoryIds(
  names: string[],
  categories: CategoryRecord[],
): string[] {
  const categoriesByName = new Map(
    categories.map((category) => [category.name.toLowerCase(), category.id]),
  );
  return names
    .map((name) => categoriesByName.get(name.toLowerCase()))
    .filter((id): id is string => Boolean(id));
}

function matchAxisAssignments(
  result: ArticleAnalysis,
  axes: ClassificationAxisRecord[],
): Array<{ axisId: string; value: string }> {
  const axesByName = new Map(
    axes.map((axis) => [axis.name.toLowerCase(), axis]),
  );
  const assignments: Array<{ axisId: string; value: string }> = [];

  for (const assignment of result.axes) {
    const axis = axesByName.get(assignment.axisName.toLowerCase());
    if (!axis) {
      continue;
    }

    const value = axis.values.find(
      (axisValue) =>
        axisValue.toLowerCase() === assignment.value.toLowerCase(),
    );
    if (!value) {
      continue;
    }

    assignments.push({
      axisId: axis.id,
      value,
    });
  }

  return assignments;
}

async function recordTelemetry(
  database: ArticleProcessingDatabase,
  input: {
    errorCode?: string;
    latencyMs: number;
    model: string;
    provider: LlmProvider;
    success: boolean;
    usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    };
    userId: string;
  },
): Promise<void> {
  await database.llmTelemetry.create({
    data: {
      completionTokens: input.usage.completionTokens,
      errorCode: input.errorCode,
      latencyMs: input.latencyMs,
      model: input.model,
      operation: LlmOperation.ARTICLE_ANALYSIS,
      promptTokens: input.usage.promptTokens,
      provider: input.provider,
      success: input.success,
      totalTokens: input.usage.totalTokens,
      userId: input.userId,
    },
  });
}

function buildCacheKey(
  contentHash: string,
  categories: CategoryRecord[],
  axes: ClassificationAxisRecord[],
  provider?: LlmProvider,
  model?: string,
): string {
  const configurationHash = createHash('sha256')
    .update(
      JSON.stringify({
        axes: axes.map((axis) => ({
          name: axis.name,
          values: axis.values,
        })),
        categories: categories.map((category) => category.name),
        model: model ?? 'unknown',
        provider: provider ?? 'unknown',
      }),
    )
    .digest('hex');
  return `${LlmOperation.ARTICLE_ANALYSIS}:${contentHash}:${configurationHash}`;
}

function mergeAliases(
  existingAliases: string[],
  newAliases: string[],
  canonicalName: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const alias of [...existingAliases, ...newAliases]) {
    const trimmed = alias.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || key === canonicalName.toLowerCase() || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function entityPairs(
  entities: EntityRecord[],
): Array<[EntityRecord, EntityRecord]> {
  const pairs: Array<[EntityRecord, EntityRecord]> = [];

  for (let leftIndex = 0; leftIndex < entities.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < entities.length;
      rightIndex += 1
    ) {
      pairs.push([entities[leftIndex], entities[rightIndex]]);
    }
  }

  return pairs;
}

function articleTimestampSeconds(publishedAt: Date | null): number {
  return Math.floor((publishedAt?.getTime() ?? Date.now()) / 1000);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unknown article processing error.';
}

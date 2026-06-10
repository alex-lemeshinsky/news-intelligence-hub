import { createHash } from 'crypto';
import { ArticleProcessingJobData, RegenerationJobData } from '@nih/shared';
import { clearArticleAnalysis } from './analysis-cleanup.js';
import type { CacheLockCoordinator } from './cache-lock.js';
import {
  ArticleAnalysis,
  ArticleAnalysisEntity,
  LlmAttemptTelemetry,
  LlmArticleAnalysisResponse,
  LlmArticleAnalyzer,
  LlmProviderModel,
  getLlmAttempts,
  validateArticleAnalysis,
} from './llm-client.js';
import { structuredLog } from './logger.js';
import { preFilterArticle } from './pre-filter.js';
import {
  ArticleProcessingStatus,
  BackgroundStatus,
  GraphEdgeKind,
  LlmOperation,
  LlmProvider,
} from './prisma-enums.js';

const DEFAULT_MIN_CONTENT_CHARS = 500;

export interface ArticleProcessingDependencies {
  cacheLocks?: CacheLockCoordinator;
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
    findMany(args: Record<string, unknown>): Promise<ArticleLabelPointerRecord[]>;
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
    deleteMany(args: Record<string, unknown>): Promise<unknown>;
    updateMany(args: Record<string, unknown>): Promise<unknown>;
    upsert(args: Record<string, unknown>): Promise<unknown>;
  };
  llmCache: {
    create(args: Record<string, unknown>): Promise<LlmCacheRecord>;
    findUnique(args: Record<string, unknown>): Promise<LlmCacheRecord | null>;
  };
  llmTelemetry: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  regenerationRun: {
    findFirst(args: Record<string, unknown>): Promise<RegenerationRunRecord | null>;
    update(args: Record<string, unknown>): Promise<unknown>;
  };
}

interface ArticleLabelRecord {
  article: {
    contentHash: string;
    extractedText: string | null;
    id: string;
    publishedAt: Date | null;
    rawContent?: string | null;
    title: string;
  };
  articleId: string;
  id: string;
  status: string;
  userId: string;
}

interface ArticleLabelPointerRecord {
  articleId: string;
  id: string;
}

interface RegenerationRunRecord {
  articleLabelIds: string[];
  id: string;
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
  previousMentionEntityIds: string[];
  result: ArticleAnalysis;
}

export async function processArticleJob(
  dependencies: ArticleProcessingDependencies,
  payload: ArticleProcessingJobData,
): Promise<void> {
  await processArticleLabel(dependencies, payload, {
    allowedStatuses: [
      ArticleProcessingStatus.PENDING,
      ArticleProcessingStatus.FAILED,
    ],
    cacheOperation: LlmOperation.ARTICLE_ANALYSIS,
    markLabelFailedOnError: true,
    operation: LlmOperation.ARTICLE_ANALYSIS,
  });
}

export async function processRegenerationJob(
  dependencies: ArticleProcessingDependencies,
  payload: RegenerationJobData,
): Promise<void> {
  const run = await dependencies.database.regenerationRun.findFirst({
    where: {
      id: payload.runId,
      userId: payload.userId,
    },
  });

  if (!run) {
    return;
  }

  try {
    let processed = 0;
    let failed = 0;
    await updateRegenerationProgress(dependencies.database, run.id, {
      failed,
      processed,
      status: BackgroundStatus.RUNNING,
    });

    const labels = await dependencies.database.articleLabel.findMany({
      select: {
        articleId: true,
        id: true,
      },
      where: {
        id: { in: run.articleLabelIds },
        userId: payload.userId,
      },
    });
    failed = run.articleLabelIds.length - labels.length;
    if (failed > 0) {
      await updateRegenerationProgress(dependencies.database, run.id, {
        failed,
        processed,
      });
    }

    for (const label of labels) {
      try {
        const wasProcessed = await processArticleLabel(
          dependencies,
          {
            articleId: label.articleId,
            articleLabelId: label.id,
            userId: payload.userId,
          },
          {
            allowedStatuses: [
              ArticleProcessingStatus.PROCESSED,
              ArticleProcessingStatus.FAILED,
            ],
            cacheOperation: LlmOperation.ARTICLE_ANALYSIS,
            markLabelFailedOnError: false,
            operation: LlmOperation.REGENERATION,
          },
        );

        if (wasProcessed) {
          processed += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }

      await updateRegenerationProgress(dependencies.database, run.id, {
        failed,
        processed,
      });
    }

    await updateRegenerationProgress(dependencies.database, run.id, {
      failed,
      processed,
      status:
        failed > 0 ? BackgroundStatus.FAILED : BackgroundStatus.COMPLETED,
    });

    structuredLog('regeneration.completed', {
      runId: run.id,
      userId: payload.userId,
      requested: run.articleLabelIds.length,
      processed,
      failed,
    });
  } catch (error) {
    await markRegenerationRunFailed(dependencies.database, run.id, error);

    structuredLog(
      'regeneration.failed',
      {
        runId: run.id,
        userId: payload.userId,
        error: getErrorMessage(error),
      },
      'error',
    );
    throw error;
  }
}

async function updateRegenerationProgress(
  database: ArticleProcessingDatabase,
  runId: string,
  progress: {
    failed: number;
    processed: number;
    status?: BackgroundStatus;
  },
): Promise<void> {
  await database.regenerationRun.update({
    data: {
      failed: progress.failed,
      processed: progress.processed,
      ...(progress.status === undefined ? {} : { status: progress.status }),
    },
    where: { id: runId },
  });
}

async function markRegenerationRunFailed(
  database: ArticleProcessingDatabase,
  runId: string,
  error: unknown,
): Promise<void> {
  await database.regenerationRun.update({
    data: {
      error: getErrorMessage(error),
      status: BackgroundStatus.FAILED,
    },
    where: { id: runId },
  });
}

interface ArticleProcessingMode {
  allowedStatuses: ArticleProcessingStatus[];
  cacheOperation: LlmOperation;
  markLabelFailedOnError: boolean;
  operation: LlmOperation;
}

async function processArticleLabel(
  dependencies: ArticleProcessingDependencies,
  payload: ArticleProcessingJobData,
  mode: ArticleProcessingMode,
): Promise<boolean> {
  const label = await findProcessableLabel(
    dependencies.database,
    payload,
    mode.allowedStatuses,
  );
  if (!label) {
    structuredLog('article.process.skipped', {
      articleLabelId: payload.articleLabelId,
      articleId: payload.articleId,
      userId: payload.userId,
      operation: mode.operation,
      reason: 'not_in_processable_state',
    });
    return false;
  }

  let llmResponse: LlmArticleAnalysisResponse | null = null;

  try {
    if (mode.operation === LlmOperation.ARTICLE_ANALYSIS) {
      const preFilter = preFilterArticle(
        {
          content: label.article.extractedText ?? label.article.rawContent ?? '',
          title: label.article.title,
        },
        {
          minContentChars: parsePositiveIntegerEnv(
            'ARTICLE_MIN_CONTENT_CHARS',
            DEFAULT_MIN_CONTENT_CHARS,
          ),
        },
      );

      if (!preFilter.accepted) {
        await clearArticleAnalysis(dependencies.database, {
          articleId: label.article.id,
          articleLabelId: label.id,
          userId: payload.userId,
        });

        await dependencies.database.articleLabel.update({
          data: {
            importance: null,
            llmCacheId: null,
            preFilterReason: preFilter.reason,
            processedAt: null,
            status: ArticleProcessingStatus.FILTERED,
            summary: null,
          },
          where: { id: label.id },
        });

        structuredLog('article.process.filtered', {
          articleLabelId: label.id,
          articleId: label.articleId,
          userId: payload.userId,
          reason: preFilter.reason,
        });

        return true;
      }
    }

    const categories = await dependencies.database.category.findMany({
      orderBy: { name: 'asc' },
      where: { userId: payload.userId },
    });
    const axes = await dependencies.database.classificationAxis.findMany({
      orderBy: { name: 'asc' },
      where: { userId: payload.userId },
    });
    const providerModels = providerModelsForCache(dependencies.llm);
    const cacheResult = await findCachedAnalysis(
      dependencies.database,
      label.article.contentHash,
      categories,
      axes,
      providerModels,
      mode.cacheOperation,
    );
    let result: ArticleAnalysis;
    let cacheId: string;
    if (cacheResult) {
      result = cacheResult.result;
      cacheId = cacheResult.cacheId;
    } else {
      const resolveAnalysis = async (
        recheckCache: boolean,
      ): Promise<ResolvedAnalysis> => {
        if (recheckCache) {
          const lockedCacheResult = await findCachedAnalysis(
            dependencies.database,
            label.article.contentHash,
            categories,
            axes,
            providerModels,
            mode.cacheOperation,
          );
          if (lockedCacheResult) {
            return {
              cacheId: lockedCacheResult.cacheId,
              llmResponse: null,
              result: lockedCacheResult.result,
            };
          }
        }

        const response = await dependencies.llm.analyzeArticle({
          axes: axes.map((axis) => ({
            name: axis.name,
            values: axis.values,
          })),
          categories: categories.map((category) => ({ name: category.name })),
          text: label.article.extractedText ?? '',
          title: label.article.title,
        });
        llmResponse = response;
        const validatedResult = validateArticleAnalysis(response.result);
        const cacheKey = buildCacheKey(
          label.article.contentHash,
          categories,
          axes,
          response.provider,
          response.model,
          mode.cacheOperation,
        );
        const cache = await createOrReadAnalysisCache(dependencies.database, {
          cacheKey,
          contentHash: label.article.contentHash,
          model: response.model,
          operation: mode.cacheOperation,
          provider: response.provider,
          result: validatedResult,
          usage: response.usage,
        });
        return {
          cacheId: cache.id,
          llmResponse: response,
          result: cache.result,
        };
      };
      const lockKey = buildAnalysisLockKey(
        label.article.contentHash,
        categories,
        axes,
        providerModels,
        mode.cacheOperation,
      );
      const resolvedAnalysis = dependencies.cacheLocks
        ? await dependencies.cacheLocks.withLock(lockKey, () =>
            resolveAnalysis(true),
          )
        : await resolveAnalysis(false);
      cacheId = resolvedAnalysis.cacheId;
      llmResponse = resolvedAnalysis.llmResponse;
      result = resolvedAnalysis.result;
    }

    const previousMentionEntityIds = await findMentionEntityIds(
      dependencies.database,
      label.id,
    );
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
      previousMentionEntityIds,
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
      await recordAttemptTelemetry(
        dependencies.database,
        attemptsForResponse(llmResponse, true),
        payload.userId,
        mode.operation,
      );
    }

    structuredLog('article.process.completed', {
      articleLabelId: label.id,
      articleId: label.articleId,
      userId: payload.userId,
      operation: mode.operation,
      cacheHit: llmResponse === null,
      importance: result.importance,
      entityCount: context.entities.length,
    });

    return true;
  } catch (error) {
    if (mode.markLabelFailedOnError) {
      await dependencies.database.articleLabel.update({
        data: {
          status: ArticleProcessingStatus.FAILED,
        },
        where: { id: label.id },
      });
    }

    await recordAttemptTelemetry(
      dependencies.database,
      llmResponse
        ? attemptsForResponse(llmResponse, false, getErrorMessage(error))
        : getLlmAttempts(error),
      payload.userId,
      mode.operation,
    );

    structuredLog(
      'article.process.failed',
      {
        articleLabelId: label.id,
        articleId: label.articleId,
        userId: payload.userId,
        operation: mode.operation,
        markedFailed: mode.markLabelFailedOnError,
        error: getErrorMessage(error),
      },
      'error',
    );

    throw error;
  }
}

interface ResolvedAnalysis {
  cacheId: string;
  llmResponse: LlmArticleAnalysisResponse | null;
  result: ArticleAnalysis;
}

async function createOrReadAnalysisCache(
  database: ArticleProcessingDatabase,
  input: {
    cacheKey: string;
    contentHash: string;
    model: string;
    operation: LlmOperation;
    provider: LlmProvider;
    result: ArticleAnalysis;
    usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    };
  },
): Promise<{
  id: string;
  result: ArticleAnalysis;
}> {
  try {
    const cache = await database.llmCache.create({
      data: {
        cacheKey: input.cacheKey,
        completionTokens: input.usage.completionTokens,
        contentHash: input.contentHash,
        model: input.model,
        operation: input.operation,
        promptTokens: input.usage.promptTokens,
        provider: input.provider,
        responseJson: input.result,
        totalTokens: input.usage.totalTokens,
      },
    });
    return {
      id: cache.id,
      result: input.result,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const cache = await database.llmCache.findUnique({
      where: { cacheKey: input.cacheKey },
    });
    if (!cache) {
      throw error;
    }

    return {
      id: cache.id,
      result: validateArticleAnalysis(cache.responseJson),
    };
  }
}

async function findCachedAnalysis(
  database: ArticleProcessingDatabase,
  contentHash: string,
  categories: CategoryRecord[],
  axes: ClassificationAxisRecord[],
  providerModels: LlmProviderModel[],
  operation: LlmOperation,
): Promise<{
  cacheId: string;
  result: ArticleAnalysis;
} | null> {
  for (const providerModel of providerModels) {
    const cacheKey = buildCacheKey(
      contentHash,
      categories,
      axes,
      providerModel.provider,
      providerModel.model,
      operation,
    );
    const cached = await database.llmCache.findUnique({
      where: { cacheKey },
    });

    if (cached) {
      return {
        cacheId: cached.id,
        result: validateArticleAnalysis(cached.responseJson),
      };
    }
  }

  return null;
}

async function findProcessableLabel(
  database: ArticleProcessingDatabase,
  payload: ArticleProcessingJobData,
  allowedStatuses: ArticleProcessingStatus[],
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
    !allowedStatuses.includes(label.status as ArticleProcessingStatus)
  ) {
    return null;
  }

  return label;
}

async function findMentionEntityIds(
  database: ArticleProcessingDatabase,
  articleLabelId: string,
): Promise<string[]> {
  const mentions = await database.articleEntityMention.findMany({
    select: { entityId: true },
    where: { articleLabelId },
  });
  return [...new Set(mentions.map((mention) => mention.entityId))];
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
  const previousEntityIds = context.previousMentionEntityIds;
  const currentEntityIds = context.entities.map((entity) => entity.id);

  for (const entityId of previousEntityIds) {
    await deleteGraphEdge(database, {
      fromNodeId: articleNodeId,
      kind: GraphEdgeKind.MENTIONS,
      toNodeId: `entity:${entityId}`,
      userId: context.label.userId,
    });
  }

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

  const currentPairKeys = entityPairKeys(currentEntityIds);
  const affectedPairKeys = new Set([
    ...entityPairKeys(previousEntityIds),
    ...currentPairKeys,
  ]);

  for (const pairKey of affectedPairKeys) {
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
        userId: context.label.userId,
      });
      continue;
    }

    if (currentPairKeys.has(pairKey)) {
      await upsertGraphEdge(database, {
        categoryId: primaryCategoryId,
        fromNodeId,
        kind: GraphEdgeKind.CO_MENTION,
        score: null,
        timestamp,
        toNodeId,
        userId: context.label.userId,
        weight,
      });
      continue;
    }

    await updateGraphEdgeWeight(database, {
      fromNodeId,
      kind: GraphEdgeKind.CO_MENTION,
      toNodeId,
      userId: context.label.userId,
      weight,
    });
  }
}

async function deleteGraphEdge(
  database: ArticleProcessingDatabase,
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

async function updateGraphEdgeWeight(
  database: ArticleProcessingDatabase,
  edge: {
    fromNodeId: string;
    kind: GraphEdgeKind;
    toNodeId: string;
    userId: string;
    weight: number;
  },
): Promise<void> {
  await database.graphEdge.updateMany({
    data: { weight: edge.weight },
    where: {
      fromNodeId: edge.fromNodeId,
      kind: edge.kind,
      toNodeId: edge.toNodeId,
      userId: edge.userId,
    },
  });
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
    operation: LlmOperation;
  },
): Promise<void> {
  await database.llmTelemetry.create({
    data: {
      completionTokens: input.usage.completionTokens,
      errorCode: input.errorCode,
      latencyMs: input.latencyMs,
      model: input.model,
      operation: input.operation,
      promptTokens: input.usage.promptTokens,
      provider: input.provider,
      success: input.success,
      totalTokens: input.usage.totalTokens,
      userId: input.userId,
    },
  });
}

async function recordAttemptTelemetry(
  database: ArticleProcessingDatabase,
  attempts: LlmAttemptTelemetry[],
  userId: string,
  operation: LlmOperation,
): Promise<void> {
  for (const attempt of attempts) {
    await recordTelemetry(database, {
      errorCode: attempt.errorCode,
      latencyMs: attempt.latencyMs,
      model: attempt.model,
      operation,
      provider: attempt.provider,
      success: attempt.success,
      usage: attempt.usage,
      userId,
    });
  }
}

function attemptsForResponse(
  response: LlmArticleAnalysisResponse,
  success: boolean,
  errorCode?: string,
): LlmAttemptTelemetry[] {
  const attempts =
    response.attempts && response.attempts.length > 0
      ? response.attempts
      : [
          {
            latencyMs: response.latencyMs,
            model: response.model,
            provider: response.provider,
            success: true,
            usage: response.usage,
          },
        ];

  if (success) {
    return attempts;
  }

  return attempts.map((attempt, index) =>
    index === attempts.length - 1
      ? {
          ...attempt,
          errorCode,
          success: false,
        }
      : attempt,
  );
}

function providerModelsForCache(
  llm: LlmArticleAnalyzer,
): LlmProviderModel[] {
  if (llm.providerModels && llm.providerModels.length > 0) {
    return llm.providerModels;
  }

  return [
    {
      model: llm.model ?? 'unknown',
      provider: llm.provider ?? LlmProvider.OPENAI,
    },
  ];
}

function buildCacheKey(
  contentHash: string,
  categories: CategoryRecord[],
  axes: ClassificationAxisRecord[],
  provider?: LlmProvider,
  model?: string,
  operation: LlmOperation = LlmOperation.ARTICLE_ANALYSIS,
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
  return `${operation}:${contentHash}:${configurationHash}`;
}

function buildAnalysisLockKey(
  contentHash: string,
  categories: CategoryRecord[],
  axes: ClassificationAxisRecord[],
  providerModels: LlmProviderModel[],
  operation: LlmOperation,
): string {
  const configurationHash = createHash('sha256')
    .update(
      JSON.stringify({
        axes: axes.map((axis) => ({
          name: axis.name,
          values: axis.values,
        })),
        categories: categories.map((category) => category.name),
        providerModels,
      }),
    )
    .digest('hex');
  return `${operation}:${contentHash}:${configurationHash}`;
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
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

function articleTimestampSeconds(publishedAt: Date | null): number {
  return Math.floor((publishedAt?.getTime() ?? Date.now()) / 1000);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unknown article processing error.';
}

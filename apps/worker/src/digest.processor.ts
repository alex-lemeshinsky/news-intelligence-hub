import { DigestJobData } from '@nih/shared';
import {
  DigestBuildInput,
  LlmAttemptTelemetry,
  LlmDigestBuilder,
  LlmDigestBuildResponse,
  getLlmAttempts,
  validateDigestOverview,
} from './llm-client.js';
import { structuredLog } from './logger.js';
import {
  ArticleImportance,
  ArticleProcessingStatus,
  DigestStatus,
  LlmOperation,
  LlmProvider,
} from './prisma-enums.js';

export interface DigestDependencies {
  database: DigestDatabase;
  llm: LlmDigestBuilder;
}

export interface DigestDatabase {
  articleLabel: {
    findMany(args: Record<string, unknown>): Promise<DigestArticleLabelRecord[]>;
  };
  digest: {
    findFirst(args: Record<string, unknown>): Promise<DigestRecord | null>;
    update(args: Record<string, unknown>): Promise<unknown>;
  };
  llmTelemetry: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
}

interface DigestRecord {
  id: string;
  periodEnd: Date;
  periodStart: Date;
  scopeJson: unknown;
  userId: string;
}

interface DigestScope {
  categoryIds: string[];
  entityIds: string[];
  period: 'day' | 'week' | 'month';
}

interface DigestArticleLabelRecord {
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
  importance: string | null;
  mentions: Array<{
    entity: {
      canonicalName: string;
      id: string;
      type: string;
    };
  }>;
  summary: string | null;
}

interface DigestFacts {
  keyArticles: Array<{
    articleId: string;
    articleLabelId: string;
    categories: string[];
    importance: string | null;
    publishedAt: string | null;
    summary: string | null;
    title: string;
  }>;
  topCategories: Array<{
    categoryId: string;
    count: number;
    name: string;
  }>;
  topEntities: Array<{
    count: number;
    entityId: string;
    name: string;
    type: string;
  }>;
}

const EMPTY_DIGEST_OVERVIEW =
  'No processed articles matched this digest request.';

export async function processDigestJob(
  dependencies: DigestDependencies,
  payload: DigestJobData,
): Promise<void> {
  const digest = await dependencies.database.digest.findFirst({
    where: {
      id: payload.digestId,
      userId: payload.userId,
    },
  });

  if (!digest) {
    structuredLog('digest.build.skipped', {
      digestId: payload.digestId,
      userId: payload.userId,
      reason: 'digest_not_found',
    });
    return;
  }

  const scope = parseDigestScope(digest.scopeJson);
  let llmResponse: LlmDigestBuildResponse | null = null;

  try {
    await dependencies.database.digest.update({
      data: {
        status: DigestStatus.RUNNING,
      },
      where: { id: digest.id },
    });

    const labels = await dependencies.database.articleLabel.findMany({
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
      orderBy: [{ importance: 'asc' }, { article: { publishedAt: 'desc' } }],
      where: buildLabelWhere(payload.userId, digest, scope),
    });
    const facts = buildDigestFacts(labels);

    if (facts.keyArticles.length === 0) {
      await completeDigest(dependencies.database, digest, scope, facts, {
        overview: EMPTY_DIGEST_OVERVIEW,
      });
      structuredLog('digest.build.completed', {
        digestId: digest.id,
        userId: payload.userId,
        empty: true,
        keyArticleCount: 0,
        llmCalled: false,
      });
      return;
    }

    const llmInput = buildDigestInput(digest, scope, facts);
    llmResponse = await dependencies.llm.buildDigest(llmInput);
    const result = validateDigestOverview(llmResponse.result);

    await completeDigest(dependencies.database, digest, scope, facts, result);
    await recordAttemptTelemetry(
      dependencies.database,
      attemptsForResponse(llmResponse, true),
      payload.userId,
      LlmOperation.DIGEST,
    );

    structuredLog('digest.build.completed', {
      digestId: digest.id,
      userId: payload.userId,
      empty: false,
      keyArticleCount: facts.keyArticles.length,
      topCategoryCount: facts.topCategories.length,
      topEntityCount: facts.topEntities.length,
      llmCalled: true,
    });
  } catch (error) {
    await dependencies.database.digest.update({
      data: {
        error: getErrorMessage(error),
        status: DigestStatus.FAILED,
      },
      where: { id: digest.id },
    });

    await recordAttemptTelemetry(
      dependencies.database,
      llmResponse
        ? attemptsForResponse(llmResponse, false, getErrorMessage(error))
        : getLlmAttempts(error),
      payload.userId,
      LlmOperation.DIGEST,
    );

    structuredLog(
      'digest.build.failed',
      {
        digestId: digest.id,
        userId: payload.userId,
        error: getErrorMessage(error),
      },
      'error',
    );

    throw error;
  }
}

function buildLabelWhere(
  userId: string,
  digest: DigestRecord,
  scope: DigestScope,
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    importance: { not: ArticleImportance.JUNK },
    status: ArticleProcessingStatus.PROCESSED,
    userId,
    article: {
      publishedAt: {
        gte: digest.periodStart,
        lte: digest.periodEnd,
      },
    },
  };

  if (scope.categoryIds.length > 0) {
    where.categories = {
      some: {
        categoryId: { in: scope.categoryIds },
      },
    };
  }

  if (scope.entityIds.length > 0) {
    where.mentions = {
      some: {
        entityId: { in: scope.entityIds },
      },
    };
  }

  return where;
}

function buildDigestFacts(labels: DigestArticleLabelRecord[]): DigestFacts {
  return {
    keyArticles: buildKeyArticles(labels),
    topCategories: topCounts(
      labels.flatMap((label) =>
        label.categories.map((assignment) => ({
          id: assignment.category.id,
          name: assignment.category.name,
        })),
      ),
    )
      .slice(0, 6)
      .map((category) => ({
        categoryId: category.id,
        count: category.count,
        name: category.name,
      })),
    topEntities: topCounts(
      labels.flatMap((label) =>
        label.mentions.map((mention) => ({
          id: mention.entity.id,
          name: mention.entity.canonicalName,
          type: mention.entity.type,
        })),
      ),
    )
      .slice(0, 8)
      .map((entity) => ({
        count: entity.count,
        entityId: entity.id,
        name: entity.name,
        type: entity.type ?? '',
      })),
  };
}

function buildKeyArticles(labels: DigestArticleLabelRecord[]) {
  return [...labels]
    .sort(compareLabelsForDigest)
    .slice(0, 5)
    .map((label) => ({
      articleId: label.article.id,
      articleLabelId: label.id,
      categories: label.categories.map(
        (assignment) => assignment.category.name,
      ),
      importance: label.importance,
      publishedAt: label.article.publishedAt?.toISOString() ?? null,
      summary: label.summary,
      title: label.article.title,
    }));
}

function compareLabelsForDigest(
  left: DigestArticleLabelRecord,
  right: DigestArticleLabelRecord,
): number {
  const importanceDelta =
    importanceRank(left.importance) - importanceRank(right.importance);
  if (importanceDelta !== 0) {
    return importanceDelta;
  }

  return (
    (right.article.publishedAt?.getTime() ?? 0) -
    (left.article.publishedAt?.getTime() ?? 0)
  );
}

function importanceRank(importance: string | null): number {
  if (importance === ArticleImportance.HIGH) {
    return 0;
  }

  if (importance === ArticleImportance.NORMAL) {
    return 1;
  }

  return 2;
}

function topCounts<T extends { id: string; name: string; type?: string }>(
  items: T[],
): Array<T & { count: number }> {
  const counts = new Map<string, T & { count: number }>();

  for (const item of items) {
    const existing = counts.get(item.id);
    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(item.id, { ...item, count: 1 });
  }

  return [...counts.values()].sort(
    (left, right) =>
      right.count - left.count || left.name.localeCompare(right.name),
  );
}

function buildDigestInput(
  digest: DigestRecord,
  scope: DigestScope,
  facts: DigestFacts,
): DigestBuildInput {
  return {
    keyArticles: facts.keyArticles.map((article) => ({
      categories: article.categories,
      importance: article.importance,
      publishedAt: article.publishedAt,
      summary: article.summary,
      title: article.title,
    })),
    periodEnd: digest.periodEnd.toISOString(),
    periodStart: digest.periodStart.toISOString(),
    scope,
    topCategories: facts.topCategories.map((category) => ({
      count: category.count,
      name: category.name,
    })),
    topEntities: facts.topEntities.map((entity) => ({
      count: entity.count,
      name: entity.name,
      type: entity.type,
    })),
  };
}

async function completeDigest(
  database: DigestDatabase,
  digest: DigestRecord,
  scope: DigestScope,
  facts: DigestFacts,
  result: { overview: string },
): Promise<void> {
  await database.digest.update({
    data: {
      completedAt: new Date(),
      overview: result.overview,
      scopeJson: {
        ...scope,
        facts,
      },
      status: DigestStatus.COMPLETED,
    },
    where: { id: digest.id },
  });
}

async function recordTelemetry(
  database: DigestDatabase,
  input: {
    errorCode?: string;
    latencyMs: number;
    model: string;
    operation: LlmOperation;
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
  database: DigestDatabase,
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
  response: LlmDigestBuildResponse,
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

function parseDigestScope(value: unknown): DigestScope {
  const record = isRecord(value) ? value : {};
  return {
    categoryIds: readStringArray(record.categoryIds),
    entityIds: readStringArray(record.entityIds),
    period: isPeriod(record.period) ? record.period : 'day',
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPeriod(value: unknown): value is DigestScope['period'] {
  return value === 'day' || value === 'week' || value === 'month';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Digest processing failed.';
}

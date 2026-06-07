import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Digest, DigestStatus, Prisma } from '@prisma/client';
import { DigestJobData, JOB_NAMES, QUEUE_NAMES } from '@nih/shared';
import { DatabaseService } from '../database/database.service';
import { QueuesService } from '../queues/queues.service';

export type DigestPeriod = 'day' | 'week' | 'month';

export interface CreateDigestInput {
  categoryIds?: string[];
  entityIds?: string[];
  period: string;
}

export interface DigestFacts {
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

export interface DigestResponse {
  completedAt: string | null;
  createdAt: string;
  error: string | null;
  facts: DigestFacts | null;
  id: string;
  overview: string | null;
  period: DigestPeriod;
  periodEnd: string;
  periodStart: string;
  scope: {
    categoryIds: string[];
    entityIds: string[];
  };
  status: DigestStatus;
}

interface DigestScopeJson {
  categoryIds: string[];
  entityIds: string[];
  facts: DigestFacts | null;
  period: DigestPeriod;
}

const PERIOD_DAYS: Record<DigestPeriod, number> = {
  day: 1,
  month: 30,
  week: 7,
};

@Injectable()
export class DigestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queues: QueuesService,
  ) {}

  async list(userId: string): Promise<DigestResponse[]> {
    const digests = await this.database.digest.findMany({
      orderBy: { createdAt: 'desc' },
      where: { userId },
    });

    return digests.map(mapDigest);
  }

  async get(userId: string, digestId: string): Promise<DigestResponse> {
    const digest = await this.database.digest.findFirst({
      where: {
        id: digestId,
        userId,
      },
    });

    if (!digest) {
      throw new NotFoundException('Digest was not found.');
    }

    return mapDigest(digest);
  }

  async create(
    userId: string,
    input: CreateDigestInput,
  ): Promise<DigestResponse> {
    const period = normalizePeriod(input.period);
    const categoryIds = normalizeIds(input.categoryIds);
    const entityIds = normalizeIds(input.entityIds);

    await assertOwnedIds('category', categoryIds, async () =>
      this.database.category.count({
        where: {
          id: { in: categoryIds },
          userId,
        },
      }),
    );
    await assertOwnedIds('entity', entityIds, async () =>
      this.database.entity.count({
        where: {
          id: { in: entityIds },
          userId,
        },
      }),
    );

    const periodEnd = new Date();
    const periodStart = new Date(
      periodEnd.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000,
    );
    const digest = await this.database.digest.create({
      data: {
        periodEnd,
        periodStart,
        scopeJson: {
          categoryIds,
          entityIds,
          period,
        },
        userId,
      },
    });

    try {
      const payload: DigestJobData = {
        digestId: digest.id,
        userId,
      };
      await this.queues.enqueue(
        QUEUE_NAMES.digest,
        JOB_NAMES.buildDigest,
        payload,
      );
    } catch (error) {
      await this.database.digest.update({
        data: {
          error: getErrorMessage(error),
          status: DigestStatus.FAILED,
        },
        where: { id: digest.id },
      });
      throw error;
    }

    return mapDigest(digest);
  }
}

function mapDigest(digest: Digest): DigestResponse {
  const scope = parseScopeJson(digest.scopeJson);

  return {
    completedAt: digest.completedAt?.toISOString() ?? null,
    createdAt: digest.createdAt.toISOString(),
    error: digest.error,
    facts: scope.facts,
    id: digest.id,
    overview: digest.overview,
    period: scope.period,
    periodEnd: digest.periodEnd.toISOString(),
    periodStart: digest.periodStart.toISOString(),
    scope: {
      categoryIds: scope.categoryIds,
      entityIds: scope.entityIds,
    },
    status: digest.status,
  };
}

function parseScopeJson(value: Prisma.JsonValue): DigestScopeJson {
  const record = isRecord(value) ? value : {};
  return {
    categoryIds: readStringArray(record.categoryIds),
    entityIds: readStringArray(record.entityIds),
    facts: readFacts(record.facts),
    period: isDigestPeriod(record.period) ? record.period : 'day',
  };
}

function readFacts(value: unknown): DigestFacts | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    keyArticles: readArray(value.keyArticles).map((item) => {
      const record = isRecord(item) ? item : {};
      return {
        articleId: readString(record.articleId),
        articleLabelId: readString(record.articleLabelId),
        categories: readStringArray(record.categories),
        importance: readNullableString(record.importance),
        publishedAt: readNullableString(record.publishedAt),
        summary: readNullableString(record.summary),
        title: readString(record.title),
      };
    }),
    topCategories: readArray(value.topCategories).map((item) => {
      const record = isRecord(item) ? item : {};
      return {
        categoryId: readString(record.categoryId),
        count: readNumber(record.count),
        name: readString(record.name),
      };
    }),
    topEntities: readArray(value.topEntities).map((item) => {
      const record = isRecord(item) ? item : {};
      return {
        count: readNumber(record.count),
        entityId: readString(record.entityId),
        name: readString(record.name),
        type: readString(record.type),
      };
    }),
  };
}

function normalizePeriod(value: string): DigestPeriod {
  if (isDigestPeriod(value)) {
    return value;
  }

  throw new BadRequestException('Digest period must be day, week, or month.');
}

function normalizeIds(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  if (!Array.isArray(values)) {
    throw new BadRequestException('Digest scope ids must be arrays.');
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new BadRequestException('Digest scope ids must be strings.');
    }

    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

async function assertOwnedIds(
  label: 'category' | 'entity',
  ids: string[],
  countOwned: () => Promise<number>,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const ownedCount = await countOwned();
  if (ownedCount !== ids.length) {
    throw new BadRequestException(`Digest ${label} scope is invalid.`);
  }
}

function isDigestPeriod(value: unknown): value is DigestPeriod {
  return value === 'day' || value === 'week' || value === 'month';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return readArray(value).filter(
    (item): item is string => typeof item === 'string',
  );
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : 0;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Digest queue enqueue failed.';
}

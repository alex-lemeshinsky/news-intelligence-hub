import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ArticleProcessingStatus, BackgroundStatus } from '@prisma/client';
import { JOB_NAMES, QUEUE_NAMES } from '@nih/shared';
import { DatabaseService } from '../database/database.service';
import { QueuesService } from '../queues/queues.service';

export interface CreateAxisInput {
  name: string;
  values: string[];
}

export interface UpdateAxisInput {
  name?: string;
  values?: string[];
}

@Injectable()
export class AxesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queues: QueuesService,
  ) {}

  list(userId: string) {
    return this.database.classificationAxis.findMany({
      orderBy: { name: 'asc' },
      where: { userId },
    });
  }

  async create(userId: string, input: CreateAxisInput) {
    try {
      return await this.database.classificationAxis.create({
        data: {
          name: normalizeName(input.name),
          userId,
          values: normalizeValues(input.values),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Axis already exists.');
      }

      throw error;
    }
  }

  async update(userId: string, axisId: string, input: UpdateAxisInput) {
    const axis = await this.findOwnedAxis(userId, axisId);
    const data = {
      ...(input.name === undefined ? {} : { name: normalizeName(input.name) }),
      ...(input.values === undefined
        ? {}
        : { values: normalizeValues(input.values) }),
    };

    try {
      return await this.database.classificationAxis.update({
        data,
        where: { id: axis.id },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Axis already exists.');
      }

      throw error;
    }
  }

  async remove(userId: string, axisId: string) {
    const axis = await this.findOwnedAxis(userId, axisId);
    return this.database.classificationAxis.delete({
      where: { id: axis.id },
    });
  }

  getLatestRegenerationRun(userId: string) {
    return this.database.regenerationRun.findFirst({
      orderBy: { createdAt: 'desc' },
      where: { userId },
    });
  }

  async startRegeneration(userId: string) {
    const total = await this.database.articleLabel.count({
      where: buildRegenerationLabelWhere(userId),
    });
    const run = await this.database.regenerationRun.create({
      data: {
        userId,
        total,
      },
    });

    if (total === 0) {
      return this.database.regenerationRun.update({
        data: { status: 'COMPLETED' },
        where: { id: run.id },
      });
    }

    const payload = {
      runId: run.id,
      userId,
    };
    try {
      await this.queues.enqueue(
        QUEUE_NAMES.regeneration,
        JOB_NAMES.regenerateArticles,
        payload,
      );
    } catch (error) {
      await this.database.regenerationRun.update({
        data: {
          error: getErrorMessage(error),
          status: BackgroundStatus.FAILED,
        },
        where: { id: run.id },
      });
      throw error;
    }

    return run;
  }

  private async findOwnedAxis(userId: string, axisId: string) {
    const axis = await this.database.classificationAxis.findFirst({
      where: {
        id: axisId,
        userId,
      },
    });

    if (!axis) {
      throw new NotFoundException('Axis was not found.');
    }

    return axis;
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new BadRequestException('Axis name is required.');
  }

  return normalized;
}

function normalizeValues(values: string[]): string[] {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedValues.push(normalized);
  }

  if (normalizedValues.length === 0) {
    throw new BadRequestException('Axis must have at least one value.');
  }

  return normalizedValues;
}

function buildRegenerationLabelWhere(userId: string) {
  return {
    status: {
      in: [ArticleProcessingStatus.PROCESSED, ArticleProcessingStatus.FAILED],
    },
    userId,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Queue enqueue failed.';
}

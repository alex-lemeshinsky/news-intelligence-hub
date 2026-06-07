import { Injectable } from '@nestjs/common';
import { LlmOperation, LlmProvider } from '@prisma/client';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TelemetryService {
  constructor(private readonly database: DatabaseService) {}

  async getLlmOverview(userId: string): Promise<LlmTelemetryOverview> {
    const where = { userId };
    const [totals, byOperation, byProviderModel] = await Promise.all([
      this.database.llmTelemetry.aggregate({
        _avg: { latencyMs: true },
        _count: { _all: true },
        _sum: {
          completionTokens: true,
          promptTokens: true,
          totalTokens: true,
        },
        where,
      }),
      this.database.llmTelemetry.groupBy({
        _count: { _all: true },
        _sum: {
          completionTokens: true,
          promptTokens: true,
          totalTokens: true,
        },
        by: ['operation', 'success'],
        orderBy: [{ operation: 'asc' }, { success: 'desc' }],
        where,
      }),
      this.database.llmTelemetry.groupBy({
        _count: { _all: true },
        _sum: {
          completionTokens: true,
          promptTokens: true,
          totalTokens: true,
        },
        by: ['provider', 'model'],
        orderBy: [{ provider: 'asc' }, { model: 'asc' }],
        where,
      }),
    ]);

    return {
      byOperation: byOperation.map((row) => ({
        calls: row._count._all,
        completionTokens: numberOrZero(row._sum.completionTokens),
        operation: row.operation,
        promptTokens: numberOrZero(row._sum.promptTokens),
        success: row.success,
        totalTokens: numberOrZero(row._sum.totalTokens),
      })),
      byProviderModel: byProviderModel.map((row) => ({
        calls: row._count._all,
        completionTokens: numberOrZero(row._sum.completionTokens),
        model: row.model,
        promptTokens: numberOrZero(row._sum.promptTokens),
        provider: row.provider,
        totalTokens: numberOrZero(row._sum.totalTokens),
      })),
      totals: {
        averageLatencyMs: numberOrZero(totals._avg.latencyMs),
        calls: totals._count._all,
        completionTokens: numberOrZero(totals._sum.completionTokens),
        promptTokens: numberOrZero(totals._sum.promptTokens),
        totalTokens: numberOrZero(totals._sum.totalTokens),
      },
    };
  }
}

export interface LlmTelemetryOverview {
  byOperation: LlmTelemetryOperationSummary[];
  byProviderModel: LlmTelemetryProviderModelSummary[];
  totals: LlmTelemetryTotals;
}

export interface LlmTelemetryTotals {
  averageLatencyMs: number;
  calls: number;
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

export interface LlmTelemetryOperationSummary {
  calls: number;
  completionTokens: number;
  operation: LlmOperation;
  promptTokens: number;
  success: boolean;
  totalTokens: number;
}

export interface LlmTelemetryProviderModelSummary {
  calls: number;
  completionTokens: number;
  model: string;
  promptTokens: number;
  provider: LlmProvider;
  totalTokens: number;
}

function numberOrZero(value: number | null): number {
  return value === null ? 0 : Math.round(value);
}

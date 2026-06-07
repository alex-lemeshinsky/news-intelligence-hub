import { LlmOperation, LlmProvider } from '@prisma/client';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  const aggregateTelemetry = jest.fn();
  const groupTelemetry = jest.fn();

  const database = {
    llmTelemetry: {
      aggregate: aggregateTelemetry,
      groupBy: groupTelemetry,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tenant-scoped LLM spend totals and grouped breakdowns', async () => {
    aggregateTelemetry.mockResolvedValue({
      _avg: { latencyMs: 250 },
      _count: { _all: 3 },
      _sum: {
        completionTokens: 90,
        promptTokens: 210,
        totalTokens: 300,
      },
    });
    groupTelemetry
      .mockResolvedValueOnce([
        {
          _count: { _all: 2 },
          _sum: {
            completionTokens: 70,
            promptTokens: 130,
            totalTokens: 200,
          },
          operation: LlmOperation.ARTICLE_ANALYSIS,
          success: true,
        },
        {
          _count: { _all: 1 },
          _sum: {
            completionTokens: 20,
            promptTokens: 80,
            totalTokens: 100,
          },
          operation: LlmOperation.REGENERATION,
          success: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          _count: { _all: 2 },
          _sum: {
            completionTokens: 70,
            promptTokens: 130,
            totalTokens: 200,
          },
          model: 'gpt-5-mini',
          provider: LlmProvider.OPENAI,
        },
        {
          _count: { _all: 1 },
          _sum: {
            completionTokens: 20,
            promptTokens: 80,
            totalTokens: 100,
          },
          model: 'claude-sonnet-4-5',
          provider: LlmProvider.ANTHROPIC,
        },
      ]);
    const service = new TelemetryService(database as never);

    const overview = await service.getLlmOverview('user_1');

    expect(aggregateTelemetry).toHaveBeenCalledWith({
      _avg: { latencyMs: true },
      _count: { _all: true },
      _sum: {
        completionTokens: true,
        promptTokens: true,
        totalTokens: true,
      },
      where: { userId: 'user_1' },
    });
    expect(groupTelemetry).toHaveBeenNthCalledWith(1, {
      _count: { _all: true },
      _sum: {
        completionTokens: true,
        promptTokens: true,
        totalTokens: true,
      },
      by: ['operation', 'success'],
      orderBy: [{ operation: 'asc' }, { success: 'desc' }],
      where: { userId: 'user_1' },
    });
    expect(groupTelemetry).toHaveBeenNthCalledWith(2, {
      _count: { _all: true },
      _sum: {
        completionTokens: true,
        promptTokens: true,
        totalTokens: true,
      },
      by: ['provider', 'model'],
      orderBy: [{ provider: 'asc' }, { model: 'asc' }],
      where: { userId: 'user_1' },
    });
    expect(overview).toEqual({
      byOperation: [
        {
          calls: 2,
          completionTokens: 70,
          operation: 'ARTICLE_ANALYSIS',
          promptTokens: 130,
          success: true,
          totalTokens: 200,
        },
        {
          calls: 1,
          completionTokens: 20,
          operation: 'REGENERATION',
          promptTokens: 80,
          success: false,
          totalTokens: 100,
        },
      ],
      byProviderModel: [
        {
          calls: 2,
          completionTokens: 70,
          model: 'gpt-5-mini',
          promptTokens: 130,
          provider: 'OPENAI',
          totalTokens: 200,
        },
        {
          calls: 1,
          completionTokens: 20,
          model: 'claude-sonnet-4-5',
          promptTokens: 80,
          provider: 'ANTHROPIC',
          totalTokens: 100,
        },
      ],
      totals: {
        averageLatencyMs: 250,
        calls: 3,
        completionTokens: 90,
        promptTokens: 210,
        totalTokens: 300,
      },
    });
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  processArticleJob,
  processRegenerationJob,
} from './article-processing.processor.js';

describe('processArticleJob', () => {
  it('analyzes a pending article and persists labels, entities, graph edges, cache, and telemetry', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls);
    let llmCalls = 0;

    await processArticleJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            llmCalls += 1;
            return {
              latencyMs: 42,
              model: 'test-model',
              provider: 'OPENAI',
              result: {
                axes: [{ axisName: 'Reader level', value: 'Technical' }],
                categories: ['AI infra'],
                entities: [
                  {
                    aliases: ['MSFT'],
                    description: 'Cloud and AI platform company.',
                    name: 'Microsoft',
                    type: 'COMPANY',
                  },
                  {
                    name: 'Azure AI',
                    type: 'PRODUCT',
                  },
                ],
                importance: 'HIGH',
                summary: 'Microsoft shipped a new AI runtime for cloud workloads.',
              },
              usage: {
                completionTokens: 40,
                promptTokens: 100,
                totalTokens: 140,
              },
            };
          },
        },
      },
      {
        articleId: 'article_1',
        articleLabelId: 'label_1',
        userId: 'user_1',
      },
    );

    assert.equal(llmCalls, 1);
    assert.ok(calls.includes('llmCache.create'));
    assert.ok(calls.includes('articleLabel.update:PROCESSED:HIGH'));
    assert.ok(calls.includes('articleCategoryAssignment.createMany:1'));
    assert.ok(calls.includes('articleAxisAssignment.createMany:1'));
    assert.ok(calls.includes('articleEntityMention.createMany:2'));
    assert.ok(calls.includes('graphEdge.upsert:MENTIONS:article:article_1->entity:entity_microsoft'));
    assert.ok(calls.includes('graphEdge.upsert:CO_MENTION:entity:entity_azure_ai->entity:entity_microsoft'));
    assert.ok(calls.includes('llmTelemetry.create:true:140'));
  });

  it('reuses cached analysis without calling the LLM', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      cachedResponse: {
        axes: [],
        categories: [],
        entities: [],
        importance: 'NORMAL',
        summary: 'Cached summary.',
      },
    });
    let llmCalls = 0;

    await processArticleJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            llmCalls += 1;
            throw new Error('LLM should not be called when cache exists.');
          },
        },
      },
      {
        articleId: 'article_1',
        articleLabelId: 'label_1',
        userId: 'user_1',
      },
    );

    assert.equal(llmCalls, 0);
    assert.ok(calls.includes('llmCache.findUnique:hit'));
    assert.ok(calls.includes('articleLabel.update:PROCESSED:NORMAL'));
  });

  it('processes a failed label when BullMQ retries the same job', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      labelStatus: 'FAILED',
    });

    await processArticleJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            return {
              latencyMs: 20,
              model: 'test-model',
              provider: 'OPENAI',
              result: {
                axes: [],
                categories: [],
                entities: [],
                importance: 'NORMAL',
                summary: 'Retry succeeded.',
              },
              usage: {
                completionTokens: 5,
                promptTokens: 10,
                totalTokens: 15,
              },
            };
          },
        },
      },
      {
        articleId: 'article_1',
        articleLabelId: 'label_1',
        userId: 'user_1',
      },
    );

    assert.ok(calls.includes('articleLabel.update:PROCESSED:NORMAL'));
  });

  it('marks the label failed and records failed telemetry when model output is invalid', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls);

    await assert.rejects(
      processArticleJob(
        {
          database,
          llm: {
            async analyzeArticle() {
              return {
                latencyMs: 10,
                model: 'test-model',
                provider: 'OPENAI',
                result: {
                  axes: [],
                  categories: [],
                  entities: [{ name: 'Mystery', type: 'UNKNOWN' }],
                  importance: 'HIGH',
                  summary: 'Invalid entity type should fail validation.',
                },
                usage: {
                  completionTokens: 5,
                  promptTokens: 10,
                  totalTokens: 15,
                },
              };
            },
          },
        },
        {
          articleId: 'article_1',
          articleLabelId: 'label_1',
          userId: 'user_1',
        },
      ),
      /Invalid article analysis/,
    );

    assert.ok(calls.includes('articleLabel.update:FAILED'));
    assert.ok(calls.includes('llmTelemetry.create:false:15'));
  });
});

describe('processRegenerationJob', () => {
  it('reanalyzes processed labels with regeneration cache and telemetry tracking', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      labelStatus: 'PROCESSED',
    });

    await processRegenerationJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            return {
              latencyMs: 42,
              model: 'test-model',
              provider: 'OPENAI',
              result: {
                axes: [{ axisName: 'Reader level', value: 'Technical' }],
                categories: ['AI infra'],
                entities: [],
                importance: 'NORMAL',
                summary: 'Regenerated article summary.',
              },
              usage: {
                completionTokens: 40,
                promptTokens: 100,
                totalTokens: 140,
              },
            };
          },
        },
      },
      {
        runId: 'run_1',
        userId: 'user_1',
      },
    );

    assert.ok(calls.includes('regenerationRun.findFirst:run_1'));
    assert.ok(calls.includes('regenerationRun.update:RUNNING'));
    assert.ok(calls.includes('llmCache.create:REGENERATION'));
    assert.ok(calls.includes('llmTelemetry.create:REGENERATION:true:140'));
    assert.ok(calls.includes('regenerationRun.update:processed'));
    assert.ok(calls.includes('regenerationRun.update:COMPLETED'));
  });

  it('continues after a label fails and records failed regeneration progress', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      labelStatus: 'PROCESSED',
    });

    await processRegenerationJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            return {
              latencyMs: 10,
              model: 'test-model',
              provider: 'OPENAI',
              result: {
                axes: [],
                categories: [],
                entities: [{ name: 'Bad entity', type: 'UNKNOWN' }],
                importance: 'NORMAL',
                summary: 'Invalid regeneration payload.',
              },
              usage: {
                completionTokens: 4,
                promptTokens: 8,
                totalTokens: 12,
              },
            };
          },
        },
      },
      {
        runId: 'run_1',
        userId: 'user_1',
      },
    );

    assert.ok(calls.includes('articleLabel.update:FAILED'));
    assert.ok(calls.includes('llmTelemetry.create:REGENERATION:false:12'));
    assert.ok(calls.includes('regenerationRun.update:failed'));
    assert.ok(calls.includes('regenerationRun.update:FAILED'));
  });
});

interface DatabaseDoubleOptions {
  cachedResponse?: unknown;
  labelStatus?: string;
}

function createArticleProcessingDatabaseDouble(
  calls: string[],
  options: DatabaseDoubleOptions = {},
) {
  const entityIds = new Map<string, string>();
  const mentionRecords: Array<{
    articleLabelId: string;
    entityId: string;
  }> = [];

  return {
    articleLabel: {
      async findMany() {
        calls.push('articleLabel.findMany');
        return [
          {
            articleId: 'article_1',
            id: 'label_1',
          },
        ];
      },
      async findFirst() {
        calls.push('articleLabel.findFirst');
        return {
          article: {
            contentHash: 'hash_1',
            extractedText: 'Microsoft announced Azure AI runtime updates.'.repeat(20),
            id: 'article_1',
            publishedAt: new Date('2026-05-27T10:00:00.000Z'),
            title: 'Microsoft ships a new AI runtime',
          },
          articleId: 'article_1',
          id: 'label_1',
          status: options.labelStatus ?? 'PENDING',
          userId: 'user_1',
        };
      },
      async update(args: {
        data: {
          importance?: string;
          status: string;
        };
      }) {
        calls.push(
          args.data.status === 'PROCESSED'
            ? `articleLabel.update:${args.data.status}:${args.data.importance}`
            : `articleLabel.update:${args.data.status}`,
        );
        return { id: 'label_1' };
      },
    },
    articleCategoryAssignment: {
      async createMany(args: { data: unknown[] }) {
        calls.push(`articleCategoryAssignment.createMany:${args.data.length}`);
        return { count: args.data.length };
      },
      async deleteMany() {
        calls.push('articleCategoryAssignment.deleteMany');
        return { count: 0 };
      },
    },
    articleAxisAssignment: {
      async createMany(args: { data: unknown[] }) {
        calls.push(`articleAxisAssignment.createMany:${args.data.length}`);
        return { count: args.data.length };
      },
      async deleteMany() {
        calls.push('articleAxisAssignment.deleteMany');
        return { count: 0 };
      },
    },
    articleEntityMention: {
      async createMany(args: { data: unknown[] }) {
        calls.push(`articleEntityMention.createMany:${args.data.length}`);
        for (const item of args.data) {
          const record = item as {
            articleLabelId: string;
            entityId: string;
          };
          mentionRecords.push(record);
        }
        return { count: args.data.length };
      },
      async deleteMany() {
        calls.push('articleEntityMention.deleteMany');
        mentionRecords.length = 0;
        return { count: 0 };
      },
      async findMany() {
        calls.push('articleEntityMention.findMany');
        return mentionRecords;
      },
    },
    category: {
      async findMany() {
        calls.push('category.findMany');
        return [{ id: 'category_ai', name: 'AI infra' }];
      },
    },
    classificationAxis: {
      async findMany() {
        calls.push('classificationAxis.findMany');
        return [
          {
            id: 'axis_reader_level',
            name: 'Reader level',
            values: ['Executive', 'Technical'],
          },
        ];
      },
    },
    entity: {
      async findFirst(args: { where: { canonicalName?: { equals: string } } }) {
        const name = args.where.canonicalName?.equals ?? '';
        const key = name.toLowerCase();
        if (!entityIds.has(key)) {
          calls.push(`entity.findFirst:miss:${name}`);
          return null;
        }

        calls.push(`entity.findFirst:hit:${name}`);
        return { id: entityIds.get(key), aliases: [] };
      },
      async create(args: { data: { canonicalName: string } }) {
        const key = args.data.canonicalName.toLowerCase();
        const id = `entity_${key.replaceAll(' ', '_')}`;
        entityIds.set(key, id);
        calls.push(`entity.create:${args.data.canonicalName}`);
        return { id, aliases: [] };
      },
      async update(args: { where: { id: string } }) {
        calls.push(`entity.update:${args.where.id}`);
        return { id: args.where.id, aliases: [] };
      },
    },
    graphEdge: {
      async upsert(args: {
        create: {
          fromNodeId: string;
          kind: string;
          toNodeId: string;
        };
      }) {
        calls.push(
          `graphEdge.upsert:${args.create.kind}:${args.create.fromNodeId}->${args.create.toNodeId}`,
        );
        return { id: 'edge_1' };
      },
    },
    llmCache: {
      async create(args: { data: { operation: string } }) {
        calls.push('llmCache.create');
        calls.push(`llmCache.create:${args.data.operation}`);
        return { id: 'cache_1' };
      },
      async findUnique() {
        calls.push(options.cachedResponse ? 'llmCache.findUnique:hit' : 'llmCache.findUnique:miss');
        return options.cachedResponse
          ? {
              id: 'cache_existing',
              model: 'test-model',
              provider: 'OPENAI',
              responseJson: options.cachedResponse,
            }
          : null;
      },
    },
    llmTelemetry: {
      async create(args: {
        data: {
          operation: string;
          success: boolean;
          totalTokens: number;
        };
      }) {
        calls.push(`llmTelemetry.create:${args.data.success}:${args.data.totalTokens}`);
        calls.push(
          `llmTelemetry.create:${args.data.operation}:${args.data.success}:${args.data.totalTokens}`,
        );
        return { id: 'telemetry_1' };
      },
    },
    regenerationRun: {
      async findFirst(args: { where: { id: string } }) {
        calls.push(`regenerationRun.findFirst:${args.where.id}`);
        return {
          id: args.where.id,
          userId: 'user_1',
        };
      },
      async update(args: {
        data: {
          failed?: { increment: number };
          processed?: { increment: number };
          status?: string;
        };
      }) {
        if (args.data.processed) {
          calls.push('regenerationRun.update:processed');
        }
        if (args.data.failed) {
          calls.push('regenerationRun.update:failed');
        }
        if (args.data.status) {
          calls.push(`regenerationRun.update:${args.data.status}`);
        }
        return { id: 'run_1' };
      },
    },
  };
}

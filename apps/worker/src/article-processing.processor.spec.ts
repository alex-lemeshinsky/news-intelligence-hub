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

  it('records failed primary telemetry, caches fallback analysis, and processes the label when failover succeeds', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls);
    let llmCalls = 0;

    await processArticleJob(
      {
        database,
        llm: {
          providerModels: [
            { model: 'primary-model', provider: 'OPENAI' },
            { model: 'fallback-model', provider: 'ANTHROPIC' },
          ],
          async analyzeArticle() {
            llmCalls += 1;
            return {
              attempts: [
                {
                  errorCode: 'primary unavailable',
                  latencyMs: 7,
                  model: 'primary-model',
                  provider: 'OPENAI',
                  success: false,
                  usage: {
                    completionTokens: 0,
                    promptTokens: 0,
                    totalTokens: 0,
                  },
                },
                {
                  latencyMs: 31,
                  model: 'fallback-model',
                  provider: 'ANTHROPIC',
                  success: true,
                  usage: {
                    completionTokens: 9,
                    promptTokens: 21,
                    totalTokens: 30,
                  },
                },
              ],
              latencyMs: 31,
              model: 'fallback-model',
              provider: 'ANTHROPIC',
              result: {
                axes: [],
                categories: ['AI infra'],
                entities: [],
                importance: 'NORMAL',
                summary: 'Fallback provider processed the article.',
              },
              usage: {
                completionTokens: 9,
                promptTokens: 21,
                totalTokens: 30,
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
    assert.equal(
      calls.filter((call) => call === 'llmCache.findUnique:miss').length,
      2,
    );
    assert.ok(
      calls.includes(
        'llmCache.create:ARTICLE_ANALYSIS:ANTHROPIC:fallback-model',
      ),
    );
    assert.ok(calls.includes('articleLabel.update:PROCESSED:NORMAL'));
    assert.ok(
      calls.includes(
        'llmTelemetry.create:ARTICLE_ANALYSIS:OPENAI:false:0',
      ),
    );
    assert.ok(
      calls.includes(
        'llmTelemetry.create:ARTICLE_ANALYSIS:ANTHROPIC:true:30',
      ),
    );
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

  it('checks fallback cache after primary cache miss before spending LLM tokens', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      cachedResponses: [
        null,
        {
          axes: [],
          categories: [],
          entities: [],
          importance: 'NORMAL',
          summary: 'Fallback cache summary.',
        },
      ],
    });
    let llmCalls = 0;

    await processArticleJob(
      {
        database,
        llm: {
          providerModels: [
            { model: 'primary-model', provider: 'OPENAI' },
            { model: 'fallback-model', provider: 'ANTHROPIC' },
          ],
          async analyzeArticle() {
            llmCalls += 1;
            throw new Error('Fallback cache should avoid an LLM call.');
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
    assert.equal(
      calls.filter((call) => call === 'llmCache.findUnique:miss').length,
      1,
    );
    assert.equal(
      calls.filter((call) => call === 'llmCache.findUnique:hit').length,
      1,
    );
    assert.ok(calls.includes('articleLabel.update:PROCESSED:NORMAL'));
    assert.ok(!calls.includes('llmTelemetry.create:true:140'));
  });

  it('filters unprocessable pending labels before cache or LLM work', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      articleText: 'short',
    });
    let llmCalls = 0;

    await processArticleJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            llmCalls += 1;
            throw new Error('LLM should not run for pre-filtered labels.');
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
    assert.ok(calls.includes('articleLabel.update:FILTERED:too_short'));
    assert.ok(!calls.includes('category.findMany'));
    assert.ok(!calls.includes('llmCache.findUnique:miss'));
    assert.ok(!calls.includes('llmCache.findUnique:hit'));
  });

  it('uses the cached row when another worker stores the same analysis first', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      cacheCreateError: Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      }),
      cachedResponses: [
        null,
        {
          axes: [],
          categories: [],
          entities: [],
          importance: 'NORMAL',
          summary: 'Concurrent cached summary.',
        },
      ],
    });
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
                axes: [],
                categories: [],
                entities: [],
                importance: 'NORMAL',
                summary: 'Fresh summary from competing worker.',
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
    assert.ok(calls.includes('llmCache.create:error:P2002'));
    assert.equal(
      calls.filter((call) => call === 'llmCache.findUnique:miss').length,
      1,
    );
    assert.equal(
      calls.filter((call) => call === 'llmCache.findUnique:hit').length,
      1,
    );
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

  it('marks the label failed and records every failed provider attempt when all providers fail', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls);

    await assert.rejects(
      processArticleJob(
        {
          database,
          llm: {
            async analyzeArticle() {
              throw Object.assign(new Error('All providers failed'), {
                attempts: [
                  {
                    errorCode: 'primary failed',
                    latencyMs: 10,
                    model: 'primary-model',
                    provider: 'OPENAI',
                    success: false,
                    usage: {
                      completionTokens: 0,
                      promptTokens: 0,
                      totalTokens: 0,
                    },
                  },
                  {
                    errorCode: 'fallback failed',
                    latencyMs: 20,
                    model: 'fallback-model',
                    provider: 'ANTHROPIC',
                    success: false,
                    usage: {
                      completionTokens: 0,
                      promptTokens: 0,
                      totalTokens: 0,
                    },
                  },
                ],
              });
            },
          },
        },
        {
          articleId: 'article_1',
          articleLabelId: 'label_1',
          userId: 'user_1',
        },
      ),
      /All providers failed/,
    );

    assert.ok(calls.includes('articleLabel.update:FAILED'));
    assert.ok(
      calls.includes(
        'llmTelemetry.create:ARTICLE_ANALYSIS:OPENAI:false:0',
      ),
    );
    assert.ok(
      calls.includes(
        'llmTelemetry.create:ARTICLE_ANALYSIS:ANTHROPIC:false:0',
      ),
    );
  });
});

describe('processRegenerationJob', () => {
  it('reanalyzes processed labels with shared analysis cache and regeneration telemetry', async () => {
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
    assert.ok(calls.includes('llmCache.create:ARTICLE_ANALYSIS'));
    assert.ok(calls.includes('llmTelemetry.create:REGENERATION:true:140'));
    assert.ok(calls.includes('regenerationRun.update:progress:1:0'));
    assert.ok(calls.includes('regenerationRun.update:COMPLETED'));
  });

  it('uses the stored run snapshot and absolute progress during regeneration', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      articleLabelRows: [
        {
          articleId: 'article_1',
          id: 'label_1',
          status: 'PROCESSED',
        },
        {
          articleId: 'article_late',
          id: 'label_late',
          status: 'PROCESSED',
        },
      ],
      regenerationRunArticleLabelIds: ['label_1'],
    });

    await processRegenerationJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            return {
              latencyMs: 12,
              model: 'test-model',
              provider: 'OPENAI',
              result: {
                axes: [],
                categories: [],
                entities: [],
                importance: 'NORMAL',
                summary: 'Snapshot regeneration summary.',
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

    assert.ok(calls.includes('articleLabel.findMany:snapshot:label_1'));
    assert.ok(!calls.includes('articleLabel.findMany:live'));
    assert.ok(!calls.includes('articleLabel.findFirst:label_late'));
    assert.ok(calls.includes('regenerationRun.update:progress:0:0'));
    assert.ok(calls.includes('regenerationRun.update:progress:1:0'));
    assert.ok(!calls.includes('regenerationRun.update:processed'));
    assert.ok(calls.includes('regenerationRun.update:COMPLETED'));
  });

  it('marks the regeneration run failed when setup fails after running', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      articleLabelFindManyError: new Error('Snapshot lookup failed'),
      labelStatus: 'PROCESSED',
    });

    await assert.rejects(
      () =>
        processRegenerationJob(
          {
            database,
            llm: {
              async analyzeArticle() {
                throw new Error('LLM should not run when setup fails.');
              },
            },
          },
          {
            runId: 'run_1',
            userId: 'user_1',
          },
        ),
      /Snapshot lookup failed/,
    );

    assert.ok(calls.includes('regenerationRun.update:RUNNING'));
    assert.ok(
      calls.includes('regenerationRun.update:FAILED:Snapshot lookup failed'),
    );
    assert.ok(!calls.includes('llmCache.findUnique:miss'));
  });

  it('reuses article-analysis cache during regeneration without calling the LLM', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      cachedResponse: {
        axes: [],
        categories: [],
        entities: [],
        importance: 'NORMAL',
        summary: 'Cached article analysis summary.',
      },
      labelStatus: 'PROCESSED',
    });
    let llmCalls = 0;

    await processRegenerationJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            llmCalls += 1;
            throw new Error('Regeneration should reuse analysis cache.');
          },
        },
      },
      {
        runId: 'run_1',
        userId: 'user_1',
      },
    );

    assert.equal(llmCalls, 0);
    assert.ok(calls.includes('llmCache.findUnique:ARTICLE_ANALYSIS:hit'));
    assert.ok(calls.includes('articleLabel.update:PROCESSED:NORMAL'));
    assert.ok(calls.includes('regenerationRun.update:progress:1:0'));
    assert.ok(calls.includes('regenerationRun.update:COMPLETED'));
  });

  it('preserves processed labels when regeneration fails', async () => {
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

    assert.ok(!calls.includes('articleLabel.update:FAILED'));
    assert.ok(calls.includes('llmTelemetry.create:REGENERATION:false:12'));
    assert.ok(calls.includes('regenerationRun.update:progress:0:1'));
    assert.ok(calls.includes('regenerationRun.update:FAILED'));
  });

  it('removes stale mention and co-mention graph edges when regenerated entities change', async () => {
    const calls: string[] = [];
    const database = createArticleProcessingDatabaseDouble(calls, {
      existingMentions: ['entity_microsoft', 'entity_azure_ai'],
      labelStatus: 'PROCESSED',
    });

    await processRegenerationJob(
      {
        database,
        llm: {
          async analyzeArticle() {
            return {
              latencyMs: 12,
              model: 'test-model',
              provider: 'OPENAI',
              result: {
                axes: [],
                categories: [],
                entities: [
                  {
                    aliases: ['MSFT'],
                    description: 'Cloud and AI platform company.',
                    name: 'Microsoft',
                    type: 'COMPANY',
                  },
                ],
                importance: 'NORMAL',
                summary: 'Regeneration dropped the Azure AI mention.',
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

    assert.ok(
      calls.includes(
        'graphEdge.deleteMany:MENTIONS:article:article_1->entity:entity_azure_ai',
      ),
    );
    assert.ok(
      calls.includes(
        'graphEdge.deleteMany:CO_MENTION:entity:entity_azure_ai->entity:entity_microsoft',
      ),
    );
    assert.ok(
      calls.includes(
        'graphEdge.upsert:MENTIONS:article:article_1->entity:entity_microsoft',
      ),
    );
  });
});

interface DatabaseDoubleOptions {
  articleText?: string;
  cacheCreateError?: Error;
  articleLabelFindManyError?: Error;
  articleLabelRows?: ArticleLabelRow[];
  cachedResponse?: unknown;
  cachedResponses?: Array<unknown | null>;
  existingMentions?: string[];
  labelStatus?: string;
  regenerationRunArticleLabelIds?: string[];
}

interface ArticleLabelRow {
  articleId: string;
  id: string;
  status?: string;
}

function createArticleProcessingDatabaseDouble(
  calls: string[],
  options: DatabaseDoubleOptions = {},
) {
  const articleLabelRows = options.articleLabelRows ?? [
    {
      articleId: 'article_1',
      id: 'label_1',
      status: options.labelStatus ?? 'PENDING',
    },
  ];
  const entityIds = new Map<string, string>();
  const mentionRecords: Array<{
    articleLabelId: string;
    entityId: string;
  }> = (options.existingMentions ?? []).map((entityId) => ({
    articleLabelId: 'label_1',
    entityId,
  }));
  if (options.existingMentions?.includes('entity_microsoft')) {
    entityIds.set('microsoft', 'entity_microsoft');
  }
  if (options.existingMentions?.includes('entity_azure_ai')) {
    entityIds.set('azure ai', 'entity_azure_ai');
  }
  const cacheResponses = [...(options.cachedResponses ?? [])];

  return {
    articleLabel: {
      async findMany(args?: { where?: { id?: { in?: string[] } } }) {
        if (options.articleLabelFindManyError) {
          calls.push('articleLabel.findMany:error');
          throw options.articleLabelFindManyError;
        }

        const snapshotIds = args?.where?.id?.in;
        calls.push(
          snapshotIds
            ? `articleLabel.findMany:snapshot:${snapshotIds.join(',')}`
            : 'articleLabel.findMany:live',
        );
        calls.push('articleLabel.findMany');
        return articleLabelRows
          .filter((label) => !snapshotIds || snapshotIds.includes(label.id))
          .map((label) => ({
            articleId: label.articleId,
            id: label.id,
          }));
      },
      async findFirst(args: { where: { articleId: string; id: string } }) {
        calls.push(`articleLabel.findFirst:${args.where.id}`);
        calls.push('articleLabel.findFirst');
        const label = articleLabelRows.find(
          (row) =>
            row.id === args.where.id &&
            row.articleId === args.where.articleId,
        );
        if (!label) {
          return null;
        }

        return {
          article: {
            contentHash: `hash_${label.id}`,
            extractedText:
              options.articleText ??
              'Microsoft announced Azure AI runtime updates.'.repeat(20),
            id: label.articleId,
            publishedAt: new Date('2026-05-27T10:00:00.000Z'),
            title: 'Microsoft ships a new AI runtime',
          },
          articleId: label.articleId,
          id: label.id,
          status: label.status ?? options.labelStatus ?? 'PENDING',
          userId: 'user_1',
        };
      },
      async update(args: {
        data: {
          importance?: string;
          preFilterReason?: string;
          status: string;
        };
      }) {
        calls.push(
          args.data.status === 'PROCESSED'
            ? `articleLabel.update:${args.data.status}:${args.data.importance}`
            : args.data.status === 'FILTERED'
              ? `articleLabel.update:${args.data.status}:${args.data.preFilterReason}`
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
      async deleteMany(args: {
        where: {
          fromNodeId?: string;
          kind?: string;
          toNodeId?: string;
        };
      }) {
        calls.push(
          `graphEdge.deleteMany:${args.where.kind}:${args.where.fromNodeId}->${args.where.toNodeId}`,
        );
        return { count: 1 };
      },
      async updateMany(args: {
        data: {
          weight: number;
        };
        where: {
          fromNodeId?: string;
          kind?: string;
          toNodeId?: string;
        };
      }) {
        calls.push(
          `graphEdge.updateMany:${args.where.kind}:${args.where.fromNodeId}->${args.where.toNodeId}:${args.data.weight}`,
        );
        return { count: 1 };
      },
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
      async create(args: {
        data: {
          model?: string;
          operation: string;
          provider?: string;
        };
      }) {
        if (options.cacheCreateError) {
          const error = options.cacheCreateError as Error & {
            code?: string;
          };
          calls.push(`llmCache.create:error:${error.code ?? 'unknown'}`);
          throw options.cacheCreateError;
        }

        calls.push('llmCache.create');
        calls.push(`llmCache.create:${args.data.operation}`);
        calls.push(
          `llmCache.create:${args.data.operation}:${args.data.provider}:${args.data.model}`,
        );
        return { id: 'cache_1' };
      },
      async findUnique(args: { where: { cacheKey: string } }) {
        const operation = args.where.cacheKey.split(':')[0] ?? 'unknown';
        const queuedResponse =
          cacheResponses.length > 0 ? cacheResponses.shift() : undefined;
        const response =
          queuedResponse === undefined ? options.cachedResponse : queuedResponse;
        calls.push(
          response
            ? 'llmCache.findUnique:hit'
            : 'llmCache.findUnique:miss',
        );
        calls.push(
          `llmCache.findUnique:${operation}:${
            response ? 'hit' : 'miss'
          }`,
        );
        return response
          ? {
              id: 'cache_existing',
              model: 'test-model',
              provider: 'OPENAI',
              responseJson: response,
            }
          : null;
      },
    },
    llmTelemetry: {
      async create(args: {
        data: {
          operation: string;
          provider?: string;
          success: boolean;
          totalTokens: number;
        };
      }) {
        calls.push(`llmTelemetry.create:${args.data.success}:${args.data.totalTokens}`);
        calls.push(
          `llmTelemetry.create:${args.data.operation}:${args.data.success}:${args.data.totalTokens}`,
        );
        calls.push(
          `llmTelemetry.create:${args.data.operation}:${args.data.provider}:${args.data.success}:${args.data.totalTokens}`,
        );
        return { id: 'telemetry_1' };
      },
    },
    regenerationRun: {
      async findFirst(args: { where: { id: string } }) {
        calls.push(`regenerationRun.findFirst:${args.where.id}`);
        return {
          articleLabelIds:
            options.regenerationRunArticleLabelIds ??
            articleLabelRows.map((label) => label.id),
          id: args.where.id,
          userId: 'user_1',
        };
      },
      async update(args: {
        data: {
          error?: string;
          failed?: number | { increment: number };
          processed?: number | { increment: number };
          status?: string;
        };
      }) {
        if (
          typeof args.data.processed === 'number' ||
          typeof args.data.failed === 'number'
        ) {
          calls.push(
            `regenerationRun.update:progress:${args.data.processed ?? 'same'}:${args.data.failed ?? 'same'}`,
          );
        }
        if (
          args.data.processed &&
          typeof args.data.processed !== 'number'
        ) {
          calls.push('regenerationRun.update:processed');
        }
        if (args.data.failed && typeof args.data.failed !== 'number') {
          calls.push('regenerationRun.update:failed');
        }
        if (args.data.status) {
          calls.push(
            args.data.error
              ? `regenerationRun.update:${args.data.status}:${args.data.error}`
              : `regenerationRun.update:${args.data.status}`,
          );
        }
        return { id: 'run_1' };
      },
    },
  };
}

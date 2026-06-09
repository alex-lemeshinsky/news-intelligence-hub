import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { processDigestJob } from './digest.processor.js';

describe('processDigestJob', () => {
  it('builds deterministic digest facts, asks the LLM for the overview, and records telemetry', async () => {
    const calls: string[] = [];
    const database = createDigestDatabaseDouble(calls);
    let llmCalls = 0;

    await processDigestJob(
      {
        database,
        llm: {
          async buildDigest(input) {
            llmCalls += 1;
            assert.equal(input.keyArticles.length, 2);
            assert.deepEqual(
              input.topEntities.map((entity) => entity.name),
              ['OpenAI', 'Microsoft'],
            );
            assert.deepEqual(
              input.topCategories.map((category) => category.name),
              ['AI infrastructure', 'Enterprise software'],
            );
            return {
              latencyMs: 31,
              model: 'test-model',
              provider: 'OPENAI',
              result: {
                overview:
                  'AI infrastructure coverage centered on OpenAI and Microsoft.',
              },
              usage: {
                completionTokens: 20,
                promptTokens: 80,
                totalTokens: 100,
              },
            };
          },
        },
      },
      {
        digestId: 'digest_1',
        userId: 'user_1',
      },
    );

    assert.equal(llmCalls, 1);
    assert.ok(calls.includes('digest.update:RUNNING'));
    assert.ok(calls.includes('articleLabel.findMany:user_1'));
    assert.ok(calls.includes('digest.update:COMPLETED'));
    assert.ok(calls.includes('llmTelemetry.create:DIGEST:true:100'));
  });

  it('records failed primary telemetry and completes the digest when fallback succeeds', async () => {
    const calls: string[] = [];
    const database = createDigestDatabaseDouble(calls);

    await processDigestJob(
      {
        database,
        llm: {
          async buildDigest() {
            return {
              attempts: [
                {
                  errorCode: 'primary unavailable',
                  latencyMs: 9,
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
                  latencyMs: 33,
                  model: 'fallback-model',
                  provider: 'ANTHROPIC',
                  success: true,
                  usage: {
                    completionTokens: 11,
                    promptTokens: 44,
                    totalTokens: 55,
                  },
                },
              ],
              latencyMs: 33,
              model: 'fallback-model',
              provider: 'ANTHROPIC',
              result: {
                overview:
                  'Fallback digest overview focused on AI infrastructure.',
              },
              usage: {
                completionTokens: 11,
                promptTokens: 44,
                totalTokens: 55,
              },
            };
          },
        },
      },
      {
        digestId: 'digest_1',
        userId: 'user_1',
      },
    );

    assert.ok(calls.includes('digest.update:COMPLETED'));
    assert.ok(calls.includes('llmTelemetry.create:DIGEST:OPENAI:false:0'));
    assert.ok(
      calls.includes('llmTelemetry.create:DIGEST:ANTHROPIC:true:55'),
    );
  });

  it('completes an empty digest without spending LLM tokens', async () => {
    const calls: string[] = [];
    const database = createDigestDatabaseDouble(calls, {
      labels: [],
    });
    let llmCalls = 0;

    await processDigestJob(
      {
        database,
        llm: {
          async buildDigest() {
            llmCalls += 1;
            throw new Error('Digest LLM should not run without candidates.');
          },
        },
      },
      {
        digestId: 'digest_1',
        userId: 'user_1',
      },
    );

    assert.equal(llmCalls, 0);
    assert.ok(calls.includes('digest.update:COMPLETED'));
    assert.ok(
      calls.includes(
        'digest.overview:No processed articles matched this digest request.',
      ),
    );
  });

  it('marks the digest failed and records failed telemetry when LLM output is invalid', async () => {
    const calls: string[] = [];
    const database = createDigestDatabaseDouble(calls);

    await assert.rejects(
      processDigestJob(
        {
          database,
          llm: {
            async buildDigest() {
              return {
                latencyMs: 12,
                model: 'test-model',
                provider: 'OPENAI',
                result: {
                  overview: '',
                },
                usage: {
                  completionTokens: 3,
                  promptTokens: 7,
                  totalTokens: 10,
                },
              };
            },
          },
        },
        {
          digestId: 'digest_1',
          userId: 'user_1',
        },
      ),
      /Invalid digest/,
    );

    assert.ok(calls.includes('digest.update:FAILED'));
    assert.ok(calls.includes('llmTelemetry.create:DIGEST:false:10'));
  });

  it('marks the digest failed and records every failed provider attempt when all providers fail', async () => {
    const calls: string[] = [];
    const database = createDigestDatabaseDouble(calls);

    await assert.rejects(
      processDigestJob(
        {
          database,
          llm: {
            async buildDigest() {
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
          digestId: 'digest_1',
          userId: 'user_1',
        },
      ),
      /All providers failed/,
    );

    assert.ok(calls.includes('digest.update:FAILED'));
    assert.ok(calls.includes('llmTelemetry.create:DIGEST:OPENAI:false:0'));
    assert.ok(
      calls.includes('llmTelemetry.create:DIGEST:ANTHROPIC:false:0'),
    );
  });
});

interface DigestDatabaseOptions {
  labels?: DigestLabelRecord[];
}

interface DigestLabelRecord {
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

function createDigestDatabaseDouble(
  calls: string[],
  options: DigestDatabaseOptions = {},
) {
  const labels = options.labels ?? [
    {
      article: {
        id: 'article_1',
        publishedAt: new Date('2026-06-07T09:00:00.000Z'),
        title: 'OpenAI and Microsoft expand AI infrastructure',
      },
      categories: [
        {
          category: {
            id: 'category_ai',
            name: 'AI infrastructure',
          },
        },
      ],
      id: 'label_1',
      importance: 'HIGH',
      mentions: [
        {
          entity: {
            canonicalName: 'OpenAI',
            id: 'entity_openai',
            type: 'COMPANY',
          },
        },
        {
          entity: {
            canonicalName: 'Microsoft',
            id: 'entity_microsoft',
            type: 'COMPANY',
          },
        },
      ],
      summary: 'OpenAI and Microsoft announced AI infrastructure expansion.',
    },
    {
      article: {
        id: 'article_2',
        publishedAt: new Date('2026-06-06T16:00:00.000Z'),
        title: 'OpenAI launches enterprise controls',
      },
      categories: [
        {
          category: {
            id: 'category_ai',
            name: 'AI infrastructure',
          },
        },
        {
          category: {
            id: 'category_enterprise',
            name: 'Enterprise software',
          },
        },
      ],
      id: 'label_2',
      importance: 'NORMAL',
      mentions: [
        {
          entity: {
            canonicalName: 'OpenAI',
            id: 'entity_openai',
            type: 'COMPANY',
          },
        },
      ],
      summary: 'OpenAI launched enterprise governance controls.',
    },
  ];

  return {
    articleLabel: {
      async findMany(args: Record<string, unknown>) {
        const where = args.where as { userId?: string };
        calls.push(`articleLabel.findMany:${where.userId}`);
        return labels;
      },
    },
    digest: {
      async findFirst(args: Record<string, unknown>) {
        const where = args.where as { id?: string; userId?: string };
        calls.push(`digest.findFirst:${where.id}:${where.userId}`);
        return {
          id: 'digest_1',
          periodEnd: new Date('2026-06-07T12:00:00.000Z'),
          periodStart: new Date('2026-05-31T12:00:00.000Z'),
          scopeJson: {
            categoryIds: [],
            entityIds: [],
            period: 'week',
          },
          status: 'PENDING',
          userId: 'user_1',
        };
      },
      async update(args: Record<string, unknown>) {
        const data = args.data as {
          overview?: string;
          status?: string;
        };
        if (data.status) {
          calls.push(`digest.update:${data.status}`);
        }
        if (data.overview) {
          calls.push(`digest.overview:${data.overview}`);
        }
        return {};
      },
    },
    llmTelemetry: {
      async create(args: Record<string, unknown>) {
        const data = args.data as {
          operation: string;
          provider?: string;
          success: boolean;
          totalTokens: number;
        };
        calls.push(
          `llmTelemetry.create:${data.operation}:${data.success}:${data.totalTokens}`,
        );
        calls.push(
          `llmTelemetry.create:${data.operation}:${data.provider}:${data.success}:${data.totalTokens}`,
        );
        return {};
      },
    },
  };
}

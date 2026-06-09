import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createConfiguredLlmClient } from './llm-client.js';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

describe('createConfiguredLlmClient', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('accepts OpenAI JSON output wrapped in a markdown code fence', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'test-model';
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          output_text: [
            '```json',
            JSON.stringify({
              axes: [],
              categories: [],
              entities: [],
              importance: 'NORMAL',
              summary: 'A short analysis summary.',
            }),
            '```',
          ].join('\n'),
          usage: {
            input_tokens: 11,
            output_tokens: 13,
            total_tokens: 24,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );

    const response = await createConfiguredLlmClient().analyzeArticle({
      axes: [],
      categories: [],
      text: 'Long article text.',
      title: 'Article title',
    });

    assert.deepEqual(response.result, {
      axes: [],
      categories: [],
      entities: [],
      importance: 'NORMAL',
      summary: 'A short analysis summary.',
    });
  });

  it('fails over from OpenAI article analysis to Anthropic when the primary provider request fails', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'primary-model';
    process.env.LLM_FALLBACK_PROVIDER = 'anthropic';
    process.env.LLM_FALLBACK_MODEL = 'fallback-model';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    const urls: string[] = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes('/responses')) {
        return new Response(
          JSON.stringify({ error: { message: 'primary unavailable' } }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      }

      return new Response(
        JSON.stringify({
          content: [
            {
              text: JSON.stringify({
                axes: [],
                categories: [],
                entities: [],
                importance: 'NORMAL',
                summary: 'Fallback analysis summary.',
              }),
              type: 'text',
            },
          ],
          usage: {
            input_tokens: 17,
            output_tokens: 19,
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    };

    const client = createConfiguredLlmClient();
    const response = await client.analyzeArticle({
      axes: [],
      categories: [],
      text: 'Long article text.',
      title: 'Article title',
    });

    assert.deepEqual(urls, [
      'https://api.openai.com/v1/responses',
      'https://api.anthropic.com/v1/messages',
    ]);
    assert.deepEqual(client.providerModels, [
      { model: 'primary-model', provider: 'OPENAI' },
      { model: 'fallback-model', provider: 'ANTHROPIC' },
    ]);
    assert.equal(response.provider, 'ANTHROPIC');
    assert.equal(response.model, 'fallback-model');
    assert.deepEqual(
      response.attempts.map((attempt) => ({
        model: attempt.model,
        provider: attempt.provider,
        success: attempt.success,
        totalTokens: attempt.usage.totalTokens,
      })),
      [
        {
          model: 'primary-model',
          provider: 'OPENAI',
          success: false,
          totalTokens: 0,
        },
        {
          model: 'fallback-model',
          provider: 'ANTHROPIC',
          success: true,
          totalTokens: 36,
        },
      ],
    );
  });

  it('rejects a fallback provider that duplicates the primary provider', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_FALLBACK_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';

    assert.throws(
      () => createConfiguredLlmClient(),
      /LLM_FALLBACK_PROVIDER must differ from LLM_PROVIDER/,
    );
  });
});

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
});

import {
  ArticleImportance,
  EntityType,
  LlmProvider,
} from './prisma-enums.js';

export interface ArticleAnalysisInput {
  axes: Array<{
    name: string;
    values: string[];
  }>;
  categories: Array<{
    name: string;
  }>;
  text: string;
  title: string;
}

export interface ArticleAnalysisEntity {
  aliases: string[];
  description?: string;
  name: string;
  type: EntityType;
}

export interface ArticleAnalysisAxisAssignment {
  axisName: string;
  value: string;
}

export interface ArticleAnalysis {
  axes: ArticleAnalysisAxisAssignment[];
  categories: string[];
  entities: ArticleAnalysisEntity[];
  importance: ArticleImportance;
  summary: string;
}

export interface LlmUsage {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

export interface LlmArticleAnalysisResponse {
  latencyMs: number;
  model: string;
  provider: LlmProvider;
  result: unknown;
  usage: LlmUsage;
}

export interface LlmArticleAnalyzer {
  analyzeArticle(
    input: ArticleAnalysisInput,
  ): Promise<LlmArticleAnalysisResponse>;
  model?: string;
  provider?: LlmProvider;
}

interface ProviderRequest {
  input: ArticleAnalysisInput;
  maxOutputTokens: number;
  model: string;
  timeoutMs: number;
}

const articleAnalysisSchema = {
  additionalProperties: false,
  properties: {
    axes: {
      items: {
        additionalProperties: false,
        properties: {
          axisName: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['axisName', 'value'],
        type: 'object',
      },
      type: 'array',
    },
    categories: {
      items: { type: 'string' },
      type: 'array',
    },
    entities: {
      items: {
        additionalProperties: false,
        properties: {
          aliases: {
            items: { type: 'string' },
            type: 'array',
          },
          description: { type: 'string' },
          name: { type: 'string' },
          type: {
            enum: Object.values(EntityType),
            type: 'string',
          },
        },
        required: ['aliases', 'description', 'name', 'type'],
        type: 'object',
      },
      type: 'array',
    },
    importance: {
      enum: Object.values(ArticleImportance),
      type: 'string',
    },
    summary: { type: 'string' },
  },
  required: ['summary', 'importance', 'entities', 'categories', 'axes'],
  type: 'object',
} as const;

export function createConfiguredLlmClient(): LlmArticleAnalyzer {
  const provider = normalizeProvider(process.env.LLM_PROVIDER ?? 'openai');
  const model = process.env.LLM_MODEL ?? defaultModelForProvider(provider);
  const timeoutMs = parseIntegerEnv('LLM_REQUEST_TIMEOUT_MS', 30000);
  const maxOutputTokens = parseIntegerEnv('LLM_MAX_OUTPUT_TOKENS', 2000);

  return {
    model,
    provider,
    async analyzeArticle(
      input: ArticleAnalysisInput,
    ): Promise<LlmArticleAnalysisResponse> {
      const request = {
        input,
        maxOutputTokens,
        model,
        timeoutMs,
      };

      if (provider === LlmProvider.OPENAI) {
        return callOpenAi(request);
      }

      return callAnthropic(request);
    },
  };
}

export function validateArticleAnalysis(value: unknown): ArticleAnalysis {
  const record = asRecord(value, 'article analysis');
  const summary = readNonEmptyString(record.summary, 'summary');
  const importance = normalizeImportance(record.importance);
  const entities = readArray(record.entities, 'entities').map(
    normalizeEntity,
  );
  const categories = uniqueStrings(readArray(record.categories, 'categories'));
  const axes = readArray(record.axes, 'axes').map(normalizeAxisAssignment);

  return {
    axes,
    categories,
    entities,
    importance,
    summary,
  };
}

async function callOpenAi(
  request: ProviderRequest,
): Promise<LlmArticleAnalysisResponse> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const startedAt = Date.now();
  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/responses',
    {
      body: JSON.stringify({
        input: buildArticleAnalysisPrompt(request.input),
        instructions: buildArticleAnalysisInstructions(),
        max_output_tokens: request.maxOutputTokens,
        model: request.model,
        text: {
          format: {
            name: 'article_analysis',
            schema: articleAnalysisSchema,
            strict: true,
            type: 'json_schema',
          },
        },
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
    request.timeoutMs,
  );
  const body = await readProviderResponse(response);
  const usage = readOpenAiUsage(body);
  const text = readOpenAiOutputText(body);

  return {
    latencyMs: Date.now() - startedAt,
    model: request.model,
    provider: LlmProvider.OPENAI,
    result: parseJsonObject(text),
    usage,
  };
}

async function callAnthropic(
  request: ProviderRequest,
): Promise<LlmArticleAnalysisResponse> {
  const apiKey = requireEnv('ANTHROPIC_API_KEY');
  const startedAt = Date.now();
  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      body: JSON.stringify({
        max_tokens: request.maxOutputTokens,
        messages: [
          {
            content: buildArticleAnalysisPrompt(request.input),
            role: 'user',
          },
        ],
        model: request.model,
        system: buildArticleAnalysisInstructions(),
        temperature: 0,
      }),
      headers: {
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      method: 'POST',
    },
    request.timeoutMs,
  );
  const body = await readProviderResponse(response);
  const usage = readAnthropicUsage(body);
  const text = readAnthropicOutputText(body);

  return {
    latencyMs: Date.now() - startedAt,
    model: request.model,
    provider: LlmProvider.ANTHROPIC,
    result: parseJsonObject(text),
    usage,
  };
}

function buildArticleAnalysisInstructions(): string {
  return [
    'Analyze one technical or industry news article.',
    'Return only JSON matching the provided schema.',
    'Use deterministic category and axis names exactly as supplied.',
    'Do not invent categories or axis values.',
  ].join(' ');
}

function buildArticleAnalysisPrompt(input: ArticleAnalysisInput): string {
  return JSON.stringify({
    article: {
      text: input.text,
      title: input.title,
    },
    availableAxes: input.axes,
    availableCategories: input.categories,
    task:
      'Summarize the article, classify importance, extract named entities, assign matching categories, and assign matching axis values.',
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readProviderResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('LLM provider returned non-JSON response.');
  }

  if (!response.ok) {
    const message = readErrorMessage(body) ?? response.statusText;
    throw new Error(`LLM provider request failed: ${message}`);
  }

  return body;
}

function readOpenAiOutputText(value: unknown): string {
  const record = asRecord(value, 'OpenAI response');
  if (typeof record.output_text === 'string') {
    return record.output_text;
  }

  const output = readArray(record.output, 'OpenAI output');
  for (const item of output) {
    const itemRecord = asRecord(item, 'OpenAI output item');
    const content = Array.isArray(itemRecord.content)
      ? itemRecord.content
      : [];
    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem, 'OpenAI content item');
      if (typeof contentRecord.text === 'string') {
        return contentRecord.text;
      }
    }
  }

  throw new Error('OpenAI response did not include output text.');
}

function readAnthropicOutputText(value: unknown): string {
  const record = asRecord(value, 'Anthropic response');
  const content = readArray(record.content, 'Anthropic content');
  const textBlocks = content
    .map((item) => asRecord(item, 'Anthropic content item'))
    .map((item) => (typeof item.text === 'string' ? item.text : ''))
    .filter((text) => text.length > 0);

  if (textBlocks.length === 0) {
    throw new Error('Anthropic response did not include output text.');
  }

  return textBlocks.join('\n');
}

function readOpenAiUsage(value: unknown): LlmUsage {
  const record = asRecord(value, 'OpenAI response');
  const usage = asOptionalRecord(record.usage);
  const promptTokens = readNumber(usage?.input_tokens, 0);
  const completionTokens = readNumber(usage?.output_tokens, 0);
  return {
    completionTokens,
    promptTokens,
    totalTokens: readNumber(
      usage?.total_tokens,
      promptTokens + completionTokens,
    ),
  };
}

function readAnthropicUsage(value: unknown): LlmUsage {
  const record = asRecord(value, 'Anthropic response');
  const usage = asOptionalRecord(record.usage);
  const promptTokens = readNumber(usage?.input_tokens, 0);
  const completionTokens = readNumber(usage?.output_tokens, 0);
  return {
    completionTokens,
    promptTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function parseJsonObject(text: string): unknown {
  for (const candidate of jsonCandidates(text)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate before rejecting the provider response.
    }
  }

  throw new Error('LLM response was not valid JSON.');
}

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fencedJson = stripMarkdownFence(trimmed);
  if (fencedJson) {
    candidates.push(fencedJson);
  }

  const embeddedJson = extractFirstJsonObject(trimmed);
  if (embeddedJson) {
    candidates.push(embeddedJson);
  }

  return [...new Set(candidates)];
}

function stripMarkdownFence(text: string): string | null {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? null;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function normalizeEntity(value: unknown): ArticleAnalysisEntity {
  const record = asRecord(value, 'entity');
  const name = readNonEmptyString(record.name, 'entity.name');
  const type = normalizeEntityType(record.type);
  const aliases = uniqueStrings(
    Array.isArray(record.aliases) ? record.aliases : [],
  ).filter((alias) => alias.toLowerCase() !== name.toLowerCase());
  const description =
    typeof record.description === 'string' && record.description.trim()
      ? record.description.trim()
      : undefined;

  return {
    aliases,
    description,
    name,
    type,
  };
}

function normalizeAxisAssignment(
  value: unknown,
): ArticleAnalysisAxisAssignment {
  const record = asRecord(value, 'axis assignment');
  return {
    axisName: readNonEmptyString(record.axisName, 'axisName'),
    value: readNonEmptyString(record.value, 'axis value'),
  };
}

function normalizeImportance(value: unknown): ArticleImportance {
  if (typeof value !== 'string') {
    throw new Error('Invalid article analysis: importance is required.');
  }

  const normalized = value.trim().toUpperCase();
  if (isArticleImportance(normalized)) {
    return normalized;
  }

  throw new Error('Invalid article analysis: importance is invalid.');
}

function normalizeEntityType(value: unknown): EntityType {
  if (typeof value !== 'string') {
    throw new Error('Invalid article analysis: entity type is required.');
  }

  const normalized = value.trim().toUpperCase();
  if (isEntityType(normalized)) {
    return normalized;
  }

  throw new Error('Invalid article analysis: entity type is invalid.');
}

function normalizeProvider(value: string): LlmProvider {
  const normalized = value.trim().toUpperCase();
  if (normalized === LlmProvider.OPENAI) {
    return LlmProvider.OPENAI;
  }

  if (normalized === LlmProvider.ANTHROPIC) {
    return LlmProvider.ANTHROPIC;
  }

  throw new Error(`Unsupported LLM provider: ${value}`);
}

function defaultModelForProvider(provider: LlmProvider): string {
  return provider === LlmProvider.OPENAI
    ? 'gpt-5-mini'
    : 'claude-sonnet-4-20250514';
}

function parseIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the active LLM provider.`);
  }

  return value;
}

function readErrorMessage(value: unknown): string | undefined {
  const record = asOptionalRecord(value);
  const error = asOptionalRecord(record?.error);
  return typeof error?.message === 'string' ? error.message : undefined;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid article analysis: ${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function asOptionalRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid article analysis: ${label} must be an array.`);
  }

  return value;
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid article analysis: ${label} is required.`);
  }

  return value.trim();
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : fallback;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function isArticleImportance(value: string): value is ArticleImportance {
  return Object.values(ArticleImportance).includes(
    value as ArticleImportance,
  );
}

function isEntityType(value: string): value is EntityType {
  return Object.values(EntityType).includes(value as EntityType);
}

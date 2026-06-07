import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import {
  ArticleImportance,
  ArticleProcessingStatus,
  EntityType,
  FeedStatus,
  GraphEdgeKind,
  LlmOperation,
  LlmProvider,
  PrismaClient,
  SimilarityKind,
} from '@prisma/client';
import {
  buildEntitySeenRanges,
  feedLinksForArticle,
  publishedAtForDaysAgo,
  unixSeconds,
} from './seed-helpers.js';

// Demo data seeder for News Intelligence Hub.
//
// Purpose: a reviewer running the stack on a clean machine should see a
// populated article feed, working relationship graph, and entity cards within
// minutes, without configuring LLM keys or waiting for live feed processing.
//
// The seeder is deterministic and idempotent: it owns one demo user (looked up
// by email) and rebuilds that user's data on every run. Raw `Article` rows are
// shared across users, so they are upserted by `normalizedUrl` rather than
// deleted. Nothing belonging to other users is ever touched.
//
// Scope is intentionally limited to data the UI actually renders: feeds with
// status, processed/filtered/pending article labels, category and axis
// assignments, entities with aliases, mentions, similarity, graph edges, and
// aggregate LLM telemetry for the settings dashboard. Digest rows are not
// seeded yet because no read path surfaces them.

const prisma = new PrismaClient();

const CATEGORY_NAMES = [
  'AI infrastructure',
  'Crypto regulation',
  'DevTools',
  'Enterprise software',
] as const;

const AXES: ReadonlyArray<{ name: string; values: string[] }> = [
  { name: 'Content type', values: ['Analysis', 'Launch', 'Funding', 'Regulation'] },
  { name: 'Reader level', values: ['Technical', 'Executive', 'General'] },
  { name: 'Region', values: ['Global', 'North America', 'Europe', 'Asia'] },
  { name: 'Tone', values: ['Positive', 'Neutral', 'Critical'] },
  { name: 'Market impact', values: ['High', 'Medium', 'Low'] },
];

interface FeedSeed {
  key: string;
  title: string;
  url: string;
  status: FeedStatus;
  lastError?: string;
}

const FEEDS: ReadonlyArray<FeedSeed> = [
  {
    key: 'techpulse',
    title: 'TechPulse Daily',
    url: 'https://demo.news-intelligence.local/techpulse.xml',
    status: FeedStatus.ACTIVE,
  },
  {
    key: 'wiregraph',
    title: 'WireGraph Briefing',
    url: 'https://demo.news-intelligence.local/wiregraph.xml',
    status: FeedStatus.ACTIVE,
  },
  {
    key: 'paused',
    title: 'Markets Weekly (paused)',
    url: 'https://demo.news-intelligence.local/markets.xml',
    status: FeedStatus.PAUSED,
  },
  {
    key: 'broken',
    title: 'Legacy Wire (unreachable)',
    url: 'https://demo.news-intelligence.local/legacy.xml',
    status: FeedStatus.PULL_ERROR,
    lastError: 'HTTP 404 while fetching feed.',
  },
];

interface EntitySeed {
  key: string;
  name: string;
  type: EntityType;
  aliases: string[];
  description: string;
}

const ENTITIES: ReadonlyArray<EntitySeed> = [
  { key: 'openai', name: 'OpenAI', type: EntityType.COMPANY, aliases: ['OpenAI Inc.'], description: 'AI research and deployment company.' },
  { key: 'microsoft', name: 'Microsoft', type: EntityType.COMPANY, aliases: ['MSFT', 'Microsoft Corp.'], description: 'Enterprise software and cloud computing company.' },
  { key: 'nvidia', name: 'Nvidia', type: EntityType.COMPANY, aliases: ['NVDA'], description: 'GPU and accelerated-computing company.' },
  { key: 'anthropic', name: 'Anthropic', type: EntityType.COMPANY, aliases: [], description: 'AI safety company behind the Claude models.' },
  { key: 'stripe', name: 'Stripe', type: EntityType.COMPANY, aliases: [], description: 'Payments infrastructure company.' },
  { key: 'altman', name: 'Sam Altman', type: EntityType.PERSON, aliases: [], description: 'Chief executive of OpenAI.' },
  { key: 'nadella', name: 'Satya Nadella', type: EntityType.PERSON, aliases: [], description: 'Chairman and chief executive of Microsoft.' },
  { key: 'huang', name: 'Jensen Huang', type: EntityType.PERSON, aliases: [], description: 'Founder and chief executive of Nvidia.' },
  { key: 'gpt5', name: 'GPT-5', type: EntityType.PRODUCT, aliases: [], description: 'Large language model from OpenAI.' },
  { key: 'azure', name: 'Azure', type: EntityType.PRODUCT, aliases: ['Microsoft Azure'], description: 'Microsoft cloud computing platform.' },
  { key: 'claude', name: 'Claude', type: EntityType.PRODUCT, aliases: [], description: 'AI assistant developed by Anthropic.' },
  { key: 'genai', name: 'Generative AI', type: EntityType.TECHNOLOGY, aliases: ['GenAI'], description: 'Models that generate text, code, and media.' },
  { key: 'gpu', name: 'GPU', type: EntityType.TECHNOLOGY, aliases: ['graphics processing unit'], description: 'Parallel compute hardware used to train and serve models.' },
  { key: 'sanfrancisco', name: 'San Francisco', type: EntityType.LOCATION, aliases: ['SF'], description: 'City in California and a major AI hub.' },
  { key: 'europe', name: 'Europe', type: EntityType.LOCATION, aliases: [], description: 'Region with active technology regulation.' },
];

type AxisValueMap = Partial<Record<(typeof AXES)[number]['name'], string>>;

interface ArticleSeed {
  key: string;
  feedKey: string;
  duplicateFeedKeys?: readonly string[];
  title: string;
  url: string;
  daysAgo: number;
  status: ArticleProcessingStatus;
  importance?: ArticleImportance;
  summary?: string;
  preFilterReason?: string;
  body: string;
  categories: string[];
  axes: AxisValueMap;
  mentions: string[];
}

const ARTICLES: ReadonlyArray<ArticleSeed> = [
  {
    key: 'gpt5-launch',
    feedKey: 'techpulse',
    duplicateFeedKeys: ['wiregraph'],
    title: 'OpenAI unveils GPT-5 with major reasoning gains',
    url: 'https://demo.news-intelligence.local/techpulse/gpt5-launch',
    daysAgo: 1,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.HIGH,
    summary: 'OpenAI introduced GPT-5, citing large improvements in multi-step reasoning and tool use. Sam Altman framed it as a step toward more reliable autonomous agents.',
    body: 'OpenAI announced GPT-5, its newest large language model, with what the company describes as substantial gains in multi-step reasoning, planning, and tool use. Chief executive Sam Altman said the model reduces hallucinations on hard tasks and is designed to power more reliable agents. The release deepens the competitive race in generative AI and raises the bar for rivals building frontier systems.',
    categories: ['AI infrastructure'],
    axes: { 'Content type': 'Launch', 'Reader level': 'Technical', 'Region': 'Global', 'Tone': 'Positive', 'Market impact': 'High' },
    mentions: ['openai', 'gpt5', 'altman', 'genai'],
  },
  {
    key: 'gpt5-launch-dup',
    feedKey: 'wiregraph',
    title: 'OpenAI announces GPT-5 launch with a leap in reasoning',
    url: 'https://demo.news-intelligence.local/wiregraph/openai-gpt5',
    daysAgo: 1,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.HIGH,
    summary: 'A second outlet covered the GPT-5 launch, emphasizing the reasoning improvements and OpenAI\'s positioning against competitors.',
    body: 'OpenAI has launched GPT-5, the company said, highlighting a leap in reasoning quality and more dependable tool use. Coverage of the announcement stressed the model\'s agentic capabilities and the intensifying competition in generative AI. Sam Altman reiterated the focus on reliability for production use.',
    categories: ['AI infrastructure'],
    axes: { 'Content type': 'Launch', 'Reader level': 'General', 'Region': 'Global', 'Tone': 'Neutral', 'Market impact': 'High' },
    mentions: ['openai', 'gpt5', 'genai'],
  },
  {
    key: 'azure-capacity',
    feedKey: 'techpulse',
    title: 'Microsoft expands Azure AI capacity with Nvidia GPUs',
    url: 'https://demo.news-intelligence.local/techpulse/azure-capacity',
    daysAgo: 2,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.HIGH,
    summary: 'Microsoft is scaling Azure AI infrastructure with a new wave of Nvidia GPUs, citing surging enterprise demand. Satya Nadella tied the buildout to the OpenAI partnership.',
    body: 'Microsoft said it is expanding Azure data-center capacity with a large order of Nvidia GPUs to meet enterprise demand for generative AI workloads. Chief executive Satya Nadella linked the investment to the company\'s partnership with OpenAI and to growing Copilot adoption. The buildout underscores how compute supply is shaping the AI infrastructure market.',
    categories: ['AI infrastructure', 'Enterprise software'],
    axes: { 'Content type': 'Launch', 'Reader level': 'Executive', 'Region': 'North America', 'Tone': 'Neutral', 'Market impact': 'High' },
    mentions: ['microsoft', 'azure', 'nvidia', 'gpu', 'nadella'],
  },
  {
    key: 'nvidia-revenue',
    feedKey: 'wiregraph',
    title: 'Nvidia reports record data-center revenue',
    url: 'https://demo.news-intelligence.local/wiregraph/nvidia-revenue',
    daysAgo: 3,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.NORMAL,
    summary: 'Nvidia posted record data-center revenue driven by AI demand. Jensen Huang pointed to GPU supply as the gating factor for the industry.',
    body: 'Nvidia reported record quarterly data-center revenue as demand for AI accelerators continued to outstrip supply. Chief executive Jensen Huang said GPU availability remains the main constraint for customers scaling generative AI. Analysts read the results as further evidence of a durable AI infrastructure cycle.',
    categories: ['AI infrastructure'],
    axes: { 'Content type': 'Analysis', 'Reader level': 'Executive', 'Region': 'Global', 'Tone': 'Positive', 'Market impact': 'High' },
    mentions: ['nvidia', 'huang', 'gpu'],
  },
  {
    key: 'claude-enterprise',
    feedKey: 'wiregraph',
    title: 'Anthropic ships Claude update aimed at enterprises',
    url: 'https://demo.news-intelligence.local/wiregraph/claude-enterprise',
    daysAgo: 4,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.NORMAL,
    summary: 'Anthropic released an enterprise-focused Claude update with longer context and stronger tool integration, sharpening competition in generative AI.',
    body: 'Anthropic released an update to Claude aimed at enterprise customers, adding longer context handling and tighter tool integration. The company positioned the release around reliability and safety for business workflows. The move intensifies competition with other generative AI providers in the enterprise segment.',
    categories: ['AI infrastructure', 'Enterprise software'],
    axes: { 'Content type': 'Launch', 'Reader level': 'Technical', 'Region': 'Global', 'Tone': 'Positive', 'Market impact': 'Medium' },
    mentions: ['anthropic', 'claude', 'genai'],
  },
  {
    key: 'altman-safety',
    feedKey: 'techpulse',
    title: 'Sam Altman discusses AI safety at San Francisco summit',
    url: 'https://demo.news-intelligence.local/techpulse/altman-safety',
    daysAgo: 5,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.NORMAL,
    summary: 'At a San Francisco summit, Sam Altman argued that generative AI progress must be paired with stronger evaluation and oversight.',
    body: 'Speaking at a summit in San Francisco, OpenAI chief executive Sam Altman argued that the rapid progress of generative AI must be matched by stronger evaluation, oversight, and deployment safeguards. He called for shared safety standards across the industry while defending continued capability research.',
    categories: ['AI infrastructure'],
    axes: { 'Content type': 'Analysis', 'Reader level': 'General', 'Region': 'North America', 'Tone': 'Neutral', 'Market impact': 'Medium' },
    mentions: ['altman', 'openai', 'sanfrancisco', 'genai'],
  },
  {
    key: 'eu-crypto',
    feedKey: 'wiregraph',
    title: 'Europe advances landmark crypto regulation',
    url: 'https://demo.news-intelligence.local/wiregraph/eu-crypto',
    daysAgo: 6,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.NORMAL,
    summary: 'European regulators moved forward on a comprehensive crypto-asset framework, setting disclosure and stablecoin rules that could become a global reference point.',
    body: 'Regulators in Europe advanced a comprehensive framework for crypto-assets, introducing disclosure obligations and reserve requirements for stablecoin issuers. Officials said the rules aim to protect consumers while preserving innovation, and analysts expect the regime to influence policy beyond the region.',
    categories: ['Crypto regulation'],
    axes: { 'Content type': 'Regulation', 'Reader level': 'Executive', 'Region': 'Europe', 'Tone': 'Neutral', 'Market impact': 'Medium' },
    mentions: ['europe'],
  },
  {
    key: 'stripe-api',
    feedKey: 'techpulse',
    title: 'Stripe launches new developer payments API',
    url: 'https://demo.news-intelligence.local/techpulse/stripe-api',
    daysAgo: 7,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.NORMAL,
    summary: 'Stripe shipped a redesigned payments API focused on developer experience, with simpler primitives and improved error handling.',
    body: 'Stripe introduced a redesigned payments API that the company says simplifies common integration patterns and improves error handling for developers. The update includes new primitives for subscriptions and clearer idempotency semantics, part of a broader push to streamline developer tooling.',
    categories: ['DevTools'],
    axes: { 'Content type': 'Launch', 'Reader level': 'Technical', 'Region': 'Global', 'Tone': 'Positive', 'Market impact': 'Medium' },
    mentions: ['stripe'],
  },
  {
    key: 'msft-openai-partnership',
    feedKey: 'techpulse',
    title: 'Microsoft and OpenAI deepen their partnership',
    url: 'https://demo.news-intelligence.local/techpulse/msft-openai',
    daysAgo: 8,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.HIGH,
    summary: 'Microsoft and OpenAI extended their partnership, expanding Azure as the primary platform for OpenAI workloads. Satya Nadella and Sam Altman framed it as a long-term alignment.',
    body: 'Microsoft and OpenAI said they are deepening their partnership, with Azure remaining the primary cloud platform for OpenAI\'s training and inference workloads. Satya Nadella and Sam Altman described the arrangement as a long-term alignment spanning compute, distribution, and product integration across the enterprise software stack.',
    categories: ['Enterprise software', 'AI infrastructure'],
    axes: { 'Content type': 'Analysis', 'Reader level': 'Executive', 'Region': 'North America', 'Tone': 'Neutral', 'Market impact': 'High' },
    mentions: ['microsoft', 'openai', 'nadella', 'altman', 'azure'],
  },
  {
    key: 'genai-adoption',
    feedKey: 'wiregraph',
    title: 'Generative AI adoption accelerates across enterprises',
    url: 'https://demo.news-intelligence.local/wiregraph/genai-adoption',
    daysAgo: 9,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.NORMAL,
    summary: 'A survey shows accelerating enterprise adoption of generative AI, with Microsoft tooling frequently cited as an entry point.',
    body: 'Enterprise adoption of generative AI is accelerating, according to a new survey, with organizations moving from pilots to production deployments. Respondents frequently cited Microsoft tooling as an entry point, while flagging cost control and governance as the main challenges of scaling the technology.',
    categories: ['Enterprise software'],
    axes: { 'Content type': 'Analysis', 'Reader level': 'Executive', 'Region': 'Global', 'Tone': 'Positive', 'Market impact': 'Medium' },
    mentions: ['genai', 'microsoft'],
  },
  {
    key: 'nvidia-openai-compute',
    feedKey: 'wiregraph',
    title: 'Nvidia and OpenAI collaborate on next-generation compute',
    url: 'https://demo.news-intelligence.local/wiregraph/nvidia-openai',
    daysAgo: 10,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.HIGH,
    summary: 'Nvidia and OpenAI outlined a collaboration on next-generation compute, with Jensen Huang and Sam Altman stressing efficiency gains for large models.',
    body: 'Nvidia and OpenAI described a collaboration on next-generation compute designed to improve the efficiency of training and serving large models. Jensen Huang and Sam Altman emphasized that GPU architecture and model design are increasingly co-developed, a dynamic reshaping the AI infrastructure landscape.',
    categories: ['AI infrastructure'],
    axes: { 'Content type': 'Analysis', 'Reader level': 'Technical', 'Region': 'Global', 'Tone': 'Positive', 'Market impact': 'High' },
    mentions: ['nvidia', 'openai', 'gpu', 'huang', 'altman'],
  },
  {
    key: 'devtools-roundup',
    feedKey: 'techpulse',
    title: 'Developer tools roundup: notable new SDKs',
    url: 'https://demo.news-intelligence.local/techpulse/devtools-roundup',
    daysAgo: 11,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.NORMAL,
    summary: 'A roundup of recent developer SDK releases, including updated tooling from Stripe aimed at faster integration.',
    body: 'A roundup of recent developer tooling highlights several new and updated SDKs across payments, observability, and AI integration. Stripe\'s refreshed libraries feature prominently, with reviewers noting clearer defaults and better typing. The piece frames the releases as part of a steady improvement in developer experience.',
    categories: ['DevTools'],
    axes: { 'Content type': 'Analysis', 'Reader level': 'Technical', 'Region': 'Global', 'Tone': 'Positive', 'Market impact': 'Low' },
    mentions: ['stripe'],
  },
  {
    key: 'junk-promo',
    feedKey: 'wiregraph',
    title: 'Sponsored: unlock premium crypto trading signals today',
    url: 'https://demo.news-intelligence.local/wiregraph/sponsored-signals',
    daysAgo: 6,
    status: ArticleProcessingStatus.PROCESSED,
    importance: ArticleImportance.JUNK,
    summary: 'Promotional content with no substantive reporting; classified as low-value by the analysis model.',
    body: 'Sponsored content promoting a paid crypto trading signals service. The piece consists of marketing claims and calls to action rather than reporting, and the analysis model classified it as low-value junk so it does not pollute the graph or digests.',
    categories: [],
    axes: {},
    mentions: [],
  },
  {
    key: 'prefiltered-stub',
    feedKey: 'wiregraph',
    title: 'Untitled feed item',
    url: 'https://demo.news-intelligence.local/wiregraph/empty-item',
    daysAgo: 2,
    status: ArticleProcessingStatus.FILTERED,
    preFilterReason: 'Content below minimum length; rejected by deterministic pre-filter before any LLM call.',
    body: 'Read more.',
    categories: [],
    axes: {},
    mentions: [],
  },
  {
    key: 'pending-chip',
    feedKey: 'techpulse',
    title: 'Breaking: startup announces new AI inference chip',
    url: 'https://demo.news-intelligence.local/techpulse/inference-chip',
    daysAgo: 0,
    status: ArticleProcessingStatus.PENDING,
    body: 'A startup unveiled a new AI inference chip it claims improves performance per watt for serving large language models. Details are still emerging and the article is awaiting analysis. Independent benchmarks have not yet been published, and the company has not disclosed pricing or availability for the new accelerator.',
    categories: [],
    axes: {},
    mentions: [],
  },
];

// Pairs of article keys that describe the same story across different feeds.
const SIMILARITIES: ReadonlyArray<{ source: string; target: string; kind: SimilarityKind; score: number }> = [
  { source: 'gpt5-launch', target: 'gpt5-launch-dup', kind: SimilarityKind.SEMANTIC, score: 0.92 },
];

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

function contentHashFor(article: ArticleSeed): string {
  return createHash('sha256').update(`${article.title}\n${article.body}`).digest('hex');
}

function pairKey(nodeA: string, nodeB: string): string {
  return [nodeA, nodeB].sort().join('|');
}

async function main(): Promise<void> {
  if (process.env.SEED_DEMO_DATA === 'false') {
    console.log(JSON.stringify({ event: 'seed.skipped', reason: 'SEED_DEMO_DATA=false' }));
    return;
  }

  const email = (process.env.SEED_DEMO_EMAIL ?? 'demo@news-intelligence.local').trim().toLowerCase();
  const password = process.env.SEED_DEMO_PASSWORD ?? 'demo-password-change-me';
  const now = new Date();

  console.log(JSON.stringify({ event: 'seed.start', email }));

  // Idempotency: remove any prior demo user and the rows that do not cascade
  // from a user delete (ArticleSimilarity has no user relation). Shared Article
  // rows are preserved and upserted below.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.articleSimilarity.deleteMany({ where: { userId: existing.id } });
    await prisma.llmTelemetry.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
    console.log(JSON.stringify({ event: 'seed.reset', userId: existing.id }));
  }

  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, emailConfirmedAt: now },
  });

  const categoryIdByName = new Map<string, string>();
  for (const name of CATEGORY_NAMES) {
    const category = await prisma.category.create({ data: { name, userId: user.id } });
    categoryIdByName.set(name, category.id);
  }

  for (const axis of AXES) {
    await prisma.classificationAxis.create({
      data: { name: axis.name, values: axis.values, userId: user.id },
    });
  }

  const feedIdByKey = new Map<string, string>();
  for (const feed of FEEDS) {
    const created = await prisma.feed.create({
      data: {
        userId: user.id,
        url: feed.url,
        title: feed.title,
        status: feed.status,
        lastError: feed.lastError ?? null,
      },
    });
    feedIdByKey.set(feed.key, created.id);
  }

  const entityIdByKey = new Map<string, string>();
  const entitySeenRanges = buildEntitySeenRanges(
    ARTICLES.filter((article) => article.status === ArticleProcessingStatus.PROCESSED),
    now,
  );
  for (const entity of ENTITIES) {
    const seenRange = entitySeenRanges.get(entity.key);
    const created = await prisma.entity.create({
      data: {
        userId: user.id,
        canonicalName: entity.name,
        type: entity.type,
        aliases: entity.aliases,
        description: entity.description,
        firstSeen: seenRange?.firstSeen ?? null,
        lastSeen: seenRange?.lastSeen ?? null,
      },
    });
    entityIdByKey.set(entity.key, created.id);
  }

  const articleIdByKey = new Map<string, string>();
  // Accumulators for graph edges, built only from processed articles.
  const coMention = new Map<string, { weight: number; categoryId: string | null; ts: number }>();

  // Oldest first so the most recent article wins when stamping co-mention
  // category/timestamp, mirroring the worker's incremental upsert behavior.
  const orderedArticles = [...ARTICLES].sort((a, b) => b.daysAgo - a.daysAgo);

  for (const article of orderedArticles) {
    const publishedAt = publishedAtForDaysAgo(article.daysAgo, now);
    const normalizedUrl = normalizeUrl(article.url);
    const contentHash = contentHashFor(article);

    const stored = await prisma.article.upsert({
      where: { normalizedUrl },
      create: {
        normalizedUrl,
        contentHash,
        canonicalUrl: article.url,
        title: article.title,
        publishedAt,
        rawContent: article.body,
        extractedText: article.body,
        language: 'en',
      },
      update: {
        contentHash,
        canonicalUrl: article.url,
        title: article.title,
        publishedAt,
        rawContent: article.body,
        extractedText: article.body,
        language: 'en',
      },
    });
    articleIdByKey.set(article.key, stored.id);

    for (const feedLink of feedLinksForArticle(article)) {
      await prisma.feedArticle.create({
        data: {
          feedId: feedIdByKey.get(feedLink.feedKey)!,
          articleId: stored.id,
          originalUrl: feedLink.originalUrl,
          pulledAt: publishedAt,
        },
      });
    }

    const processedAt =
      article.status === ArticleProcessingStatus.PROCESSED ? publishedAt : null;
    const label = await prisma.articleLabel.create({
      data: {
        userId: user.id,
        articleId: stored.id,
        status: article.status,
        importance: article.importance ?? null,
        summary: article.summary ?? null,
        preFilterReason: article.preFilterReason ?? null,
        processedAt,
      },
    });

    const assignedCategoryIds: string[] = [];
    for (const categoryName of article.categories) {
      const categoryId = categoryIdByName.get(categoryName)!;
      assignedCategoryIds.push(categoryId);
      await prisma.articleCategoryAssignment.create({
        data: { articleLabelId: label.id, categoryId },
      });
    }

    for (const [axisName, value] of Object.entries(article.axes)) {
      if (!value) {
        continue;
      }
      const axis = await prisma.classificationAxis.findUnique({
        where: { userId_name: { userId: user.id, name: axisName } },
      });
      if (axis) {
        await prisma.articleAxisAssignment.create({
          data: { articleLabelId: label.id, axisId: axis.id, value },
        });
      }
    }

    const mentionedEntityIds: string[] = [];
    for (const entityKey of article.mentions) {
      const entityId = entityIdByKey.get(entityKey)!;
      mentionedEntityIds.push(entityId);
      await prisma.articleEntityMention.create({
        data: { articleLabelId: label.id, entityId },
      });
    }

    if (article.status !== ArticleProcessingStatus.PROCESSED) {
      continue;
    }

    const primaryCategoryId = assignedCategoryIds[0] ?? null;
    const ts = unixSeconds(publishedAt);
    const articleNodeId = `article:${stored.id}`;

    // MENTIONS edges: article -> entity.
    for (const entityId of mentionedEntityIds) {
      await prisma.graphEdge.create({
        data: {
          userId: user.id,
          fromNodeId: articleNodeId,
          toNodeId: `entity:${entityId}`,
          kind: GraphEdgeKind.MENTIONS,
          weight: 1,
          categoryId: primaryCategoryId,
          ts,
        },
      });
    }

    // CO_MENTION edges: every unordered pair of entities in this article.
    for (let i = 0; i < mentionedEntityIds.length; i += 1) {
      for (let j = i + 1; j < mentionedEntityIds.length; j += 1) {
        const key = pairKey(`entity:${mentionedEntityIds[i]}`, `entity:${mentionedEntityIds[j]}`);
        const current = coMention.get(key);
        coMention.set(key, {
          weight: (current?.weight ?? 0) + 1,
          categoryId: primaryCategoryId,
          ts,
        });
      }
    }
  }

  for (const [key, value] of coMention) {
    const [fromNodeId, toNodeId] = key.split('|');
    await prisma.graphEdge.create({
      data: {
        userId: user.id,
        fromNodeId,
        toNodeId,
        kind: GraphEdgeKind.CO_MENTION,
        weight: value.weight,
        categoryId: value.categoryId,
        ts: value.ts,
      },
    });
  }

  for (const similarity of SIMILARITIES) {
    const sourceId = articleIdByKey.get(similarity.source)!;
    const targetId = articleIdByKey.get(similarity.target)!;
    await prisma.articleSimilarity.create({
      data: {
        userId: user.id,
        articleId: sourceId,
        similarArticleId: targetId,
        kind: similarity.kind,
        score: similarity.score,
      },
    });

    const [fromNodeId, toNodeId] = [`article:${sourceId}`, `article:${targetId}`].sort();
    await prisma.graphEdge.create({
      data: {
        userId: user.id,
        fromNodeId,
        toNodeId,
        kind: GraphEdgeKind.SIMILAR,
        score: similarity.score,
        ts: unixSeconds(now),
      },
    });
  }

  const telemetryRows = buildDemoTelemetryRows(user.id, now);
  await prisma.llmTelemetry.createMany({ data: telemetryRows });

  const processedCount = ARTICLES.filter(
    (article) => article.status === ArticleProcessingStatus.PROCESSED,
  ).length;
  console.log(
    JSON.stringify({
      event: 'seed.complete',
      userId: user.id,
      email,
      feeds: FEEDS.length,
      entities: ENTITIES.length,
      articles: ARTICLES.length,
      processedArticles: processedCount,
      coMentionEdges: coMention.size,
      telemetryRows: telemetryRows.length,
    }),
  );
}

function buildDemoTelemetryRows(userId: string, now: Date) {
  const articleRows = ARTICLES.filter(
    (article) => article.status === ArticleProcessingStatus.PROCESSED,
  ).map((article, index) => {
    const promptTokens = 860 + index * 19;
    const completionTokens = 140 + index * 11;
    return {
      userId,
      operation: LlmOperation.ARTICLE_ANALYSIS,
      provider: LlmProvider.OPENAI,
      model: 'gpt-5-mini',
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      success: true,
      latencyMs: 950 + index * 55,
      createdAt: publishedAtForDaysAgo(article.daysAgo, now),
    };
  });

  return [
    ...articleRows,
    {
      userId,
      operation: LlmOperation.REGENERATION,
      provider: LlmProvider.ANTHROPIC,
      model: 'claude-sonnet-4-5',
      promptTokens: 2_400,
      completionTokens: 410,
      totalTokens: 2_810,
      success: true,
      latencyMs: 2_300,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },
    {
      userId,
      operation: LlmOperation.DIGEST,
      provider: LlmProvider.OPENAI,
      model: 'gpt-5-mini',
      promptTokens: 1_650,
      completionTokens: 330,
      totalTokens: 1_980,
      success: true,
      latencyMs: 1_620,
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
  ];
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: 'seed.failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

# news-intelligence-hub

UA-Skills: News Intelligence Hub

## Apps

- `apps/api`: NestJS backend.
- `apps/web`: Next.js frontend.
- `apps/worker`: BullMQ worker process.
- `packages/shared`: shared TypeScript contracts and constants.
- `packages/database`: Prisma/PostgreSQL schema and database client helper.

## Infrastructure

- `docker-compose.yml`: full containerized stack (Postgres, Redis, API, worker, web, and one-shot migration/seed steps).
- `docker-compose.dev.yml`: PostgreSQL and Redis for the host-based development flow.
- `Dockerfile`: single multi-stage image that builds the whole monorepo and runs the API, worker, web, and migration commands.
- `.env.example`: documented environment variables for the app, database, Redis, Bull Board, auth, LLM providers, and feed processing.

## Startup

Both flows read the same `.env` (copy it from the template first):

```bash
cp .env.example .env
# fill in JWT_SECRET, BULL_BOARD_PASSWORD, and an LLM provider key
```

### Full stack (one command)

Builds and runs everything; migrations are applied automatically, then demo data
is loaded, before the API and worker start.

```bash
docker compose up --build
```

- Web app: `http://localhost:3000`
- API: `http://localhost:3001`
- Bull Board: `http://localhost:3001/admin/queues`

Stop with `docker compose down` (add `-v` to drop the database and Redis
volumes).

### Development / debug

Runs only Postgres and Redis in Docker; the API, worker, and web run on the host
with hot reload.

```bash
docker compose -f docker-compose.dev.yml up -d
npm install
npm run db:deploy             # apply migrations to the dev database
npm run db:seed               # load demo data (optional but recommended)
npm run dev:api               # http://localhost:3001
npm run dev:web               # http://localhost:3000
npm run dev:worker
```

## Demo Data

The full-stack flow seeds demo data automatically (a one-shot `seed` container
that runs after migrations). For the development flow, run `npm run db:seed`.

The seeder creates one confirmed demo user with a populated article feed and a
ready-to-explore relationship graph, so a reviewer sees working data without
configuring LLM keys or waiting for live feed pulls. Log in with the credentials
from `.env` (`SEED_DEMO_EMAIL` / `SEED_DEMO_PASSWORD`); the defaults are:

- Email: `demo@news-intelligence.local`
- Password: `demo-password-change-me`

These are development-only demo credentials, not real secrets. What the demo
user gets:

- Four feeds spanning active and paused states without starting in an error
  state.
- Fifteen articles: thirteen processed (with summaries, importance, categories,
  axis labels, and extracted entities), one deterministically pre-filtered, one
  LLM-labelled junk, and one still pending - so all processing states are
  visible in the feed.
- One GPT-5 article appears under two feed sources to demonstrate exact
  duplicate counting, and a related GPT-5 article is linked semantically to
  demonstrate the similar counter.
- Fifteen entities (companies, people, products, technologies, locations) with
  aliases, plus `mentions`, `co_mention`, and `similar` graph edges.
- One completed weekly digest built from the seeded article/entity graph, so the
  Digests page has a reviewable result before any live LLM credentials are used.
- Seeded LLM telemetry rows for article analysis, regeneration, and digest
  operations, so the settings dashboard shows nonzero calls and token totals.

The seeder is idempotent: it owns only the demo user and rebuilds that user's
data on each run, never touching other accounts. Set `SEED_DEMO_DATA=false` in
`.env` to skip it. Note that re-labelling demo articles via the regeneration
action still requires a valid LLM provider key, since the demo data is inserted
directly rather than produced by the analysis pipeline.

## Initial Scripts

- `npm run dev:api`: start the NestJS API in watch mode on `http://localhost:3001`.
- `npm run dev:web`: start the Next.js frontend on `http://localhost:3000`.
- `npm run dev:worker`: start the BullMQ worker in watch mode.
- `npm run build`: build shared packages and all apps.
- `npm run build:api`: build the API.
- `npm run build:web`: build the frontend.
- `npm run build:worker`: build the worker.
- `npm run build:shared`: build shared contracts.
- `npm run build:database`: build the database helper package.
- `npm run lint`: run all configured lint/type-check commands.
- `npm run lint:api`: lint and fix the API.
- `npm run lint:web`: lint the frontend.
- `npm run lint:worker`: type-check the worker.
- `npm run lint:shared`: type-check shared contracts.
- `npm run lint:database`: type-check the database package.
- `npm run test:api`: run API unit tests.
- `npm run db:generate`: generate the Prisma client from `packages/database/prisma/schema.prisma`.
- `npm run db:deploy`: apply committed migrations to the database.
- `npm run db:seed`: build the database package and load demo data (see Demo Data).

## Auth Flow

- Register at `http://localhost:3000/register`.
- In development, the API returns a confirmation link because
  `DEV_EMAIL_CONFIRMATION=true`.
- Confirming email creates the same HttpOnly cookie session used by login.
- Protected API routes derive the current user from the cookie/JWT and no longer
  accept `x-user-id` as an ownership substitute.

## Implemented Should / Could Items

All Should-level items in the brief are implemented:

- **LLM provider failover.** Article analysis, regeneration, and digest jobs fall
  over from the primary provider to `LLM_FALLBACK_PROVIDER` / `LLM_FALLBACK_MODEL`
  on request-level failures, recording a telemetry attempt for each provider
  tried. See ADR-4.
- **Meaningful unit tests for critical logic.** Covered: LLM adapter response
  parsing/validation and failover (`apps/worker/src/llm-client.spec.ts`), the
  deterministic pre-filter and HTML stripping (`apps/worker/src/pre-filter.spec.ts`),
  feed pull idempotency and status handling, article processing (cache reuse,
  invalid-output rejection, retries), regeneration and digest progress/telemetry,
  and the tenant-scoped API services (`apps/api/src/**/*.spec.ts`).
- **Graph filters by time window and text search.** The graph page filters by node
  type, category, time window (24h / 7d / 30d), and a label text search.
- **Period digests.** Day/week/month digests scoped by category and/or entity;
  deterministic code selects top entities, top categories, and key articles, and
  the LLM writes only the overview text (ADR-1, FR-11).
- **Aggregated LLM telemetry dashboard.** The settings page shows calls, prompt /
  completion / total tokens, and average latency, broken down by operation type
  and by provider/model.

Could-level items implemented:

- **Semantic article similarity.** Articles are linked by a `similar` edge with a
  score, surfaced as a "similar" counter on feed cards and article cards, and as
  edges in the graph. Similarity is computed economically without pairwise LLM
  calls (FR-5).
- **Top entities and categories for a period.** Each digest result presents ranked
  top entities, top categories, and key articles for the requested window.

## Known Limitations

- **Demo regeneration needs a live LLM key.** Seeded demo labels are inserted
  directly, so re-running the regeneration action against demo data requires a
  valid `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`; without one the run fails loudly
  rather than silently.
- **Failover scope.** Failover covers provider/request failures (missing
  credentials, timeouts, non-2xx responses, missing output, non-JSON output). It
  does not retry semantically valid but low-quality output. See ADR-4.
- **Graph layout.** Node placement is a deterministic article/entity split, not a
  force-directed or category-clustered layout; the timeline slider, edge animation
  over time, and graph export Could-items are not implemented.
- **Article feed search.** Full-text search over article bodies is not
  implemented; text search exists on the graph (node labels) and structured
  filters (category, feed, importance, state, period) exist on the feed.
- **Bull Board auth.** The queue dashboard uses a single shared basic-auth
  credential from env rather than per-user access, and ships with insecure
  defaults that must be overridden. See ADR-8.

## Architectural Decision Records

### ADR-1: Deterministic code vs LLM responsibility split

Context: Article ingestion involves both mechanical work (fetching, parsing,
cleaning, hashing, joining records, building a graph) and semantic work
(summarizing, classifying, naming the entities a story is about). Routing
mechanical work through an LLM would be slower, non-deterministic, more
expensive, and harder to test, and the competition explicitly penalizes using
the model for tasks that plain code can do.

Decision: The worker keeps a hard boundary between the two. Deterministic code
owns everything that can be expressed as a rule:

- RSS/Atom fetching and field mapping (`feed-parser.ts`, built on `rss-parser`),
  skipping items without a title or link.
- HTML stripping and the cheap pre-filter (`pre-filter.ts`): empty content,
  content shorter than the configurable `minContentChars`, and obvious SEO
  boilerplate (rejected only when two or more noise patterns match) are dropped
  before any model call.
- Content hashing and exact-duplicate detection, entity alias matching, and
  graph construction - `mentions` edges plus `co_mention` edges whose integer
  weight is counted directly from shared article mentions
  (`article-processing.processor.ts`).

The LLM is used only for semantic output: article analysis and the final prose
paragraph of a period digest. Article processing uses a single `analyzeArticle`
call that returns the summary, extracted entities, importance, suggested
categories, and axis labels together. Digest jobs first select top entities, top
categories, and key articles in deterministic code, then send only that compact
fact set to the LLM for the overview text. Even in article analysis, the model
only *proposes*: deterministic matchers (`matchCategoryIds`,
`matchAxisAssignments`) keep only the categories and axis values that exist in
the user's own configuration and silently drop hallucinated ones, so invalid
labels never reach the database.

Alternatives:

- An LLM-centric pipeline (e.g. a LangChain-style agent that also fetches,
  parses, dedups, and classifies). Rejected because mechanical steps have exact
  right answers that code already computes deterministically: routing them
  through a model would add per-article token cost and latency for tasks like
  URL normalization and hashing, make output non-reproducible (the same feed
  could parse differently on retries), and make the pipeline far harder to test,
  since asserting on a parser requires a fixture but asserting on an agent
  requires mocking or live model calls.
- Embedding similarity / LLM scoring for *all* duplicate detection. Rejected for
  the primary path because the duplicates that matter most - the same article
  syndicated across feeds - are caught exactly and for free by comparing the
  normalized URL and a content hash, with zero model cost and no false merges.
  Reserving embeddings for this would pay a per-article inference cost to
  re-derive an answer that string comparison already gives with certainty.
  Semantic similarity (genuinely different articles about the same event) is a
  harder, fuzzier problem and is kept as optional, explicitly non-quadratic
  scope rather than folded into the hot path.

Trade-offs: The split makes the expensive path cheap, cacheable, and testable
with plain fixtures, and keeps a single model call per article. The cost is that
the deterministic pre-filter is intentionally conservative - it can let
low-value articles reach the LLM rather than risk discarding real content - and
that category/axis matching is name-based, so a user renaming a category
mid-flight requires regeneration to relabel existing articles.

### ADR-2: Entity deduplication strategy

Context: The same real-world entity appears under many surface forms -
"Microsoft", "MSFT", "Microsoft Corp.", a Cyrillic spelling - and the same
short token can mean different things in different contexts ("MS" the company
vs. a person's initials). If each surface form became its own node, the graph
would fragment and co-mention counts would be meaningless. The dedup must
collapse these into one canonical entity without falsely merging genuinely
different things, and it must not cost a model call per pair of entities.

Decision: Deduplication is a hybrid of LLM proposal and deterministic decision.
During the single article-analysis call, the LLM returns each entity with a
canonical name, a type, and a list of aliases - this is where the fuzzy,
language-aware knowledge lives (it is the model that knows "MSFT" is an alias of
"Microsoft"). The worker then makes the actual merge decision in plain code
(`upsertEntities`): for each proposed entity it looks for an existing row, scoped
to the same `userId`, where the type matches **and** either the canonical name
matches case-insensitively **or** one of the proposed aliases is already stored
in that row's alias array. Alias lookup currently uses PostgreSQL array
containment, so it is exact rather than fuzzy or case-folded. On a hit it merges
- `mergeAliases` unions the alias lists case-insensitively, dropping blanks and
any alias equal to the canonical name - and widens the `firstSeen`/`lastSeen`
window (min/max, Unix seconds). On a miss it creates a new entity. A database
constraint, `@@unique([userId, canonicalName, type])`, backs exact canonical
identity so concurrent jobs cannot create two rows for the same stored canonical
name and type.

Three rules protect against false merges: matching is scoped per user, it uses
exact stored aliases and case-insensitive canonical-name matches rather than
fuzzy string distance, and it requires the `type` to match - so "MS" the company
and "MS" the person never collapse, and "Apple" the company never merges with an
"apple" product node.

Alternatives:

- Pairwise LLM "are these the same entity?" comparisons. Rejected because it is
  O(n^2) model calls in the number of entities - directly the quadratic LLM flow
  the cost requirements forbid - and it re-asks the model something it can state
  once at extraction time by emitting aliases.
- Pure deterministic fuzzy matching (e.g. Levenshtein/normalization rules with
  no model input). Rejected because string distance cannot know that "MSFT" is
  Microsoft or that a Cyrillic spelling is the same company, and loose distance
  thresholds are exactly what cause false merges between similarly spelled but
  unrelated names.
- Storing mentions as a `mentionArticleIds` array on the entity row (as the
  brief's field sketch suggests). Rejected in favor of an `ArticleEntityMention`
  join table: the join is indexable by `entityId`, lets co-mention weights be
  counted with a query instead of array scans, and avoids an unbounded array
  growing on a single hot row. The array-shaped view is reconstructed on read
  when the API needs it.

Trade-offs: Putting alias knowledge in the LLM output and the merge decision in
code keeps deduplication semantic *and* cheap - no extra model calls beyond the
one analysis call, and the merge is a single indexed lookup per entity. The cost
is that dedup quality depends on the model proposing good aliases: if it omits
an alias, two rows can co-exist until a later article supplies the linking alias,
and there is currently no manual "merge these two entities" affordance to fix a
miss after the fact.

### ADR-3: Cost control and LLM caching

Context: LLM calls are the dominant running cost and the slowest step in the
pipeline. With up to ten feeds per user, the same story is frequently syndicated
across feeds and across users, and regeneration can replay analysis over a large
backlog. Naively calling the model once per article per user would multiply
spend on identical work, and an unbounded number of concurrent calls would
invite provider rate limits and runaway bills.

Decision: Cost is controlled in layered defenses, cheapest first.

1. The deterministic pre-filter (ADR-1) discards empty, too-short, and
   boilerplate content before any model call, so junk never spends a token.
2. Each article is analyzed in a single call: the schema-constrained
   `analyzeArticle` returns summary, entities, importance, categories, and axis
   labels together rather than one call per field.
3. Results are cached in `LlmCache` under a key of
   `${operation}:${contentHash}:${configurationHash}`, where the configuration
   hash is a SHA-256 of the user's category names, axis names and values, and the
   active provider and model (`buildCacheKey`). The worker checks the cache
   before calling the provider and, on a hit, validates and reuses the stored
   JSON with zero spend. Because the key is content- and config-based rather than
   per-user, the same article under the same configuration is analyzed once and
   reused across feeds and users; per-user labels are still derived
   deterministically by mapping the cached category/axis *names* onto each user's
   own records.
4. Regeneration reuses this same `ARTICLE_ANALYSIS` cache entry, so re-running it
   without any config change is free; it only re-bills when an axis or category
   change alters the configuration hash - which is exactly when relabelling is
   actually needed.
5. Output size and latency are bounded per call by `LLM_MAX_OUTPUT_TOKENS` and
   `LLM_REQUEST_TIMEOUT_MS`, and the number of simultaneous in-flight model calls
   is capped by `LLM_CONCURRENCY` on the article-processing worker (separate from
   `WORKER_CONCURRENCY` for the cheap deterministic queues). Same-key article
   analysis uses a Redis lock (`LLM_CACHE_LOCK_TTL_MS`,
   `LLM_CACHE_LOCK_WAIT_MS`, `LLM_CACHE_LOCK_RETRY_MS`) so concurrent workers
   re-check the cache before making duplicate model calls.
6. Period digest jobs use deterministic aggregation for top entities,
   categories, and key articles, then spend at most one `DIGEST` call for the
   final overview. Empty digest result sets complete without an LLM call.
7. Successful provider calls record a `LlmTelemetry` row - provider, model,
   operation type, prompt/completion/total tokens, latency, and success. If a
   primary provider attempt fails before usable output is available, the worker
   records a failed telemetry row with zero tokens and tries the configured
   fallback provider. If a provider returns output that is later rejected during
   validation, that attempt is also recorded as failed. Cache hits cost nothing
   and are deliberately not recorded, so telemetry reflects actual measured
   provider usage.

Alternatives:

- No cache; call the model for every article every time. Rejected because it
  re-pays full price for content already analyzed - syndicated copies across
  feeds and every regeneration pass would each cost a fresh call - which is the
  single largest avoidable cost in the system.
- Caching by content hash alone, ignoring configuration. Rejected because a
  user's categories and axes are inputs to the analysis: a content-only key
  would serve stale labels after the user edits their axes, defeating the entire
  purpose of regeneration.
- A per-user cache key. Rejected because, given the configuration hash already
  captures everything that changes the output, adding the user id only blocks
  the legitimate cross-user reuse of identical analysis and provides no
  correctness benefit.
- One model call per sub-task (separate calls for summary, entities, importance,
  categories, axes). Rejected because it multiplies both token cost and latency
  several-fold for output a single strict-schema call already returns atomically.

Trade-offs: The system makes at most one provider call per unique
(content, configuration), keeps cache hits and unchanged regenerations free, and
caps both per-call size and overall concurrency so spend stays predictable. The
costs are coarse invalidation - any edit to categories or axes busts the cache
for affected content, so a single new axis value re-bills those articles on the
next regeneration - and that `LlmCache` currently has no TTL or eviction, which
is fine at MVP data scale but would need pruning to bound storage long-term.

### ADR-4: LLM provider failure and error-handling strategy

Context: The pipeline depends on two unreliable external surfaces - remote
RSS/Atom endpoints and a hosted LLM provider - plus a third internal risk: the
model can return malformed or invalid output. A single feed going down, one
provider timeout, or one bad JSON response must not corrupt stored data, stall
the whole pipeline, or vanish silently. The system has to fail loudly, keep the
rest of the app working, and recover transient errors on its own.

Decision: Errors are handled per failure domain, and the queue is the retry
backbone.

- Feed pulls are isolated per feed. A pull failure is caught, the feed row is
  set to `PULL_ERROR` with the error message stored in `lastError`, and other
  feeds keep pulling; a successful pull clears the error and returns the feed to
  `ACTIVE`. The failure is therefore visible in the UI rather than fatal to the
  worker.
- Model output is validated before it can touch the database. The provider call
  uses a strict JSON schema, and `validateArticleAnalysis` independently
  re-checks structure, enum values, and required fields; anything malformed
  throws, so invalid or hallucinated output is treated as a failure instead of
  being persisted.
- Article-processing failures (provider error, timeout, or failed validation)
  mark the `ArticleLabel` as `FAILED`, write failure telemetry for every provider
  attempt, and rethrow. BullMQ then retries with exponential backoff
  (`QUEUE_JOB_ATTEMPTS`, default 3; `QUEUE_JOB_BACKOFF_MS`, default 5000). When
  attempts are exhausted the job is retained (`removeOnFail`) and the article
  stays `FAILED`, i.e. awaiting later reprocessing, rather than being lost.
- Provider choice starts with the active provider selected by `LLM_PROVIDER` /
  `LLM_MODEL`, with both OpenAI and Anthropic adapters behind one interface
  (`createConfiguredLlmClient`). When `LLM_FALLBACK_PROVIDER` is set and differs
  from the primary provider, provider request failures automatically retry the
  same operation on `LLM_FALLBACK_MODEL` or that provider's default model.
- Failover is intentionally limited to provider/request failures such as missing
  credentials, timeouts, non-2xx responses, missing output text, or non-JSON
  provider output. If the model returns JSON that fails domain validation, the
  worker does not ask another provider to reinterpret the article; it records the
  failed attempt and lets the normal queue retry path handle it.

Alternatives:

- Catch and swallow errors - mark the article processed with empty labels.
  Rejected because it hides failures and writes meaningless data into the feed
  and graph; leaving the article `FAILED` and retriable preserves the real state.
- Persist whatever the model returns without validation. Rejected because
  malformed or out-of-enum output would corrupt labels, entities, and graph
  edges, and bad data is far more expensive to detect later than to reject at the
  boundary.
- Let a single feed or article failure crash the worker / stop the batch.
  Rejected because one broken feed URL or one malformed response would halt
  processing for every feed and user, the opposite of the required graceful
  degradation.
- Always call both providers and compare outputs. Rejected because it doubles
  spend, complicates conflict resolution, and would use LLMs for quality voting
  instead of the cheaper validation boundary the MVP already has.

Trade-offs: The chosen approach guarantees that only well-formed data is stored,
recovers transient feed and provider errors automatically, and makes every
failure durable and visible - feed status, `FAILED` labels, failed attempt
telemetry, and fallback successes - instead of silent. The costs are that
failover can spend on a second provider for the same item, fallback behavior
requires both provider credentials to be configured, and retained failed jobs
still consume Redis space when both providers fail.

### ADR-5: Backend choice - NestJS

Context: The backend is not a thin CRUD layer. It hosts many bounded contexts
(auth, feeds, articles, categories, axes, graph, telemetry, digests) plus
infrastructure concerns (database access, queue producers, and Bull Board), and
it must enforce cross-cutting rules - cookie/JWT auth and per-user data
isolation - uniformly across all of them. It also has to keep a sharp boundary
between the HTTP layer, which only enqueues work, and the worker, which performs
it, including all LLM execution.

Decision: Use NestJS. Each bounded context is a feature module wired through
NestJS's module system and dependency-injection container (`app.module.ts`
imports `AuthModule`, `FeedsModule`, `ArticlesModule`, `QueuesModule`, and so
on). Configuration is loaded through a global `ConfigModule` so all operational
values come from env, matching the no-hard-coded-config rule. Authentication and
tenant scoping are enforced with a cookie-auth guard plus a current-user
decorator rather than ad-hoc checks in each handler. The HTTP-vs-worker boundary
is expressed as a `QueuesService` that wraps BullMQ `Queue` producers: handlers
enqueue through it and never run long or LLM work inline. The worker owns the
provider abstraction (`apps/worker/src/llm-client.ts`) so the API has no empty or
misleading LLM feature module. Because NestJS runs on Express, the ready-made
Bull Board router is mounted as middleware behind basic-auth
(`bull-board.service.ts`) instead of being rebuilt in-app.

Alternatives:

- Directus, the other backend option allowed by the brief. Directus is an
  instant-backend / headless data platform: point it at a SQL database and it
  auto-generates REST and GraphQL CRUD APIs, a no-code admin app, and role-based
  permissions, with custom logic added through its Flows automation and extension
  hooks. Rejected because this product's value is not CRUD over a data model -
  it is the custom asynchronous pipeline (queue-driven feed pulling and article
  processing, deterministic pre-filtering, LLM orchestration, entity
  deduplication, incremental graph construction, and telemetry). On Directus that
  core logic would have to live inside Flows, hooks, and custom extensions, i.e.
  the architecture would be pushed into a CMS's extension points rather than
  written as first-class, explainable code, and we would still need a separate
  worker for BullMQ and the LLM anyway. The explicit custom rules the brief
  emphasizes - multi-tenant isolation enforced at the data-access layer, no LLM
  calls from HTTP handlers, and a clean HTTP-enqueues / worker-performs boundary
  - are clearer to own in application code than to express through a generated
  permission-and-automation layer, and a deliberately engineered backend is more
  defensible to explain in these ADRs than a largely generated one.
- Hand-rolled Express or Fastify with no framework. Rejected because with this
  many modules we would have to build dependency injection, module boundaries,
  config loading, guards, and lifecycle hooks ourselves; that boilerplate would
  become the de-facto architecture and make consistent auth/isolation and unit
  testing harder, which is exactly the work a framework should absorb.
- Using Next.js API routes as the only backend (no separate service). Rejected
  because the backend needs long-lived queue producers, startup/shutdown
  lifecycle, and a clean separation from both the frontend and the worker;
  route-handler-style endpoints model none of those well, and folding the API
  into the frontend would blur the HTTP-enqueues / worker-performs boundary the
  architecture depends on.
- Fastify with a custom module layer. Rejected because its raw-throughput edge is
  irrelevant at MVP scale (up to ten feeds per user, with all heavy work already
  pushed to queues), so we would reinvent the DI/module/guard conventions NestJS
  standardizes for no benefit that this workload can feel.

Trade-offs: NestJS gives enforced module boundaries, DI that makes services
testable with injected doubles, uniform guard-based auth and tenant isolation, a
natural `QueuesService` seam for the HTTP/worker split, and Express compatibility
for mounting Bull Board - all aligned with the mandated TypeScript-everywhere
stack. Compared with the Directus option specifically, the cost is that we give
up an auto-generated CRUD API, a ready-made admin UI, and built-in RBAC and user
management, so basic CRUD endpoints and auth are written by hand. That is an
acceptable price here because the CRUD surface is small next to the custom
pipeline, and owning it keeps the whole backend coherent and explainable. More
generally, NestJS also costs more upfront ceremony than a micro-framework:
per-feature modules and providers, decorator-and-DI indirection that has a
learning curve, and a heavier runtime than a bare Express app. At this project's
breadth that structure pays for itself; for a single-endpoint service it would
be overkill.

### ADR-6: Frontend choice - Next.js

Context: The brief allows either a plain React app or Next.js for the frontend,
and separately lists an SSR server as a required service. The UI has two
distinct areas - an unauthenticated auth flow (register, confirm, login) and an
authenticated workspace (feed, graph, settings) - and protected pages should not
render at all for a signed-out user. Several views also need initial data (the
graph, categories, the article feed) that depends on the user's session cookie.

Decision: Use Next.js with the App Router. The two areas are expressed as route
groups, `(auth)` and `(workspace)`, and the workspace shares a server-rendered
layout. Auth gating and initial data fetching happen in Server Components: the
workspace layout is an async server component that calls `requireCurrentUser()`
and redirects signed-out users before any protected markup renders, and pages
like the graph fetch their data server-side (`serverApiFetch('/graph')`,
`'/categories'`) with the session cookie forwarded, then hand the result to a
client component for interactivity. Interactive pieces - the react-flow graph,
filters, and forms - are Client Components (e.g. `graph-client.tsx`), since
react-flow is client-only; styling is Tailwind, and the mandated react-flow
library is used for the graph itself.

Alternatives:

- A plain React single-page app (e.g. Vite/CRA, client-rendered), the other
  frontend option in the brief. Rejected because a client-only SPA ships an empty
  shell and then fetches auth state and page data in the browser, which produces
  a flash of unauthenticated content and a client-side loading waterfall, and
  pushes route protection entirely to the client. It also would not satisfy the
  required SSR server on its own. Next.js gives a server-rendered, already
  authenticated, already populated first paint and keeps route protection on the
  server.
- Next.js with the older Pages Router instead of the App Router. Rejected because
  the App Router's Server Components express exactly the split this app wants -
  server-side auth checks and data fetching versus client-side interactivity -
  without the `getServerSideProps` plumbing the Pages Router needs for the same
  result.

Trade-offs: Next.js gives server-side auth gating, server data fetching with
cookie forwarding, a clean route-group separation of the auth and workspace
areas, and satisfies the required SSR service directly. The cost is a heavier
model than a plain React SPA: a long-running Node SSR server to run and deploy
(an extra process in docker compose) rather than static files served from any
host, the Server/Client Component boundary and `"use client"` discipline that
have a real learning curve, and the need to wrap client-only libraries such as
react-flow. For this app, where protected, data-backed pages are the norm, that
trade is worth it; for a purely static or fully client-only tool a plain React
SPA would be simpler.

### ADR-7: Database - PostgreSQL

Context: The data model is strongly relational and multi-tenant: users own
feeds, categories, axes, labels, entities, and graph edges, while raw articles
are shared across users. Several invariants must hold at the storage layer - one
canonical entity per (user, name, type), one graph edge per (user, endpoints,
kind), and cascade rules that delete a user's own configuration without deleting
shared raw articles. The processing pipeline also persists a multi-step result
per article (assignments, entity upserts, graph-edge updates, label status) that
must not be left half-written, and a few fields are naturally list- or
document-shaped (entity aliases, axis values, regeneration id lists, cached LLM
JSON).

Decision: Use PostgreSQL via Prisma. The relational core carries the
integrity-critical parts: composite unique constraints back deduplication and
graph identity (`@@unique([userId, canonicalName, type])`,
`@@unique([userId, fromNodeId, toNodeId, kind])`), foreign keys with deliberate
`onDelete` behaviour isolate and clean per-user data while preserving shared
`Article` rows, and tenant-scoped indexes (e.g. `@@index([userId, type])`) serve
the acceptance-walkthrough query paths. PostgreSQL also absorbs the
semi-structured fields without a second datastore: native `String[]` array
columns with containment queries hold entity aliases (matched with
`aliases has`), axis values, and the regeneration label-id list, and a JSON
column stores cached LLM responses (`LlmCache.responseJson`). ACID transactions
give the per-article persistence its all-or-nothing guarantee, and the unique
constraints make the worker's upserts safely idempotent under retries and
concurrency.

Alternatives:

- A document store such as MongoDB. Rejected because the product's value is
  relationships and cross-record integrity - per-tenant uniqueness, counted
  co-mentions, graph edges, and cascades that keep shared articles. A document
  store would push enforcement of composite uniqueness, referential cascades, and
  join-based co-mention counts into application code, exactly where they are easy
  to get subtly wrong (false entity merges, orphaned mentions).
- A dedicated graph database such as Neo4j. Rejected because the graph here is a
  *projection* deterministically built from relational labels and mentions and is
  small at MVP scale (up to ten feeds per user); adding a second engine for it
  would split the source of truth, make multi-tenant isolation and
  cross-store transactions harder, and add operational weight for something a
  single indexed `GraphEdge` table plus aggregate queries already serve (with
  recursive CTEs available if deeper traversal is ever needed).
- SQLite. Rejected because the API and a multi-concurrency worker write
  concurrently (labels, entities, graph edges, telemetry); SQLite's single-writer
  model would serialize and contend under that load, and it lacks the array and
  JSON features the schema leans on.
- MySQL/MariaDB. Rejected more mildly: it could work, but PostgreSQL's native
  array columns and containment queries (used for aliases and regeneration id
  lists) and its richer JSON support map directly onto this schema, avoiding the
  extra join tables or workarounds the array fields would need elsewhere.

Trade-offs: PostgreSQL enforces the tenant-isolation and deduplication invariants
at the storage layer, gives ACID guarantees for multi-step processing, covers
both relational and list/JSON-shaped data in one engine, and pairs with mature
Prisma migrations and a trivial Docker service for reproducible setup. The costs
are the schema discipline a relational store demands - every shape change is a
migration rather than a free-form write - that the deterministically built
`GraphEdge` table must be kept in sync by the worker through incremental updates
during initial processing and regeneration rather than being a native graph, and
that very deep
multi-hop traversals would be more awkward in SQL than in a purpose-built graph
database. All three are acceptable given a bounded MVP graph and a schema that is
already well understood.

### ADR-8: Queue monitoring - Bull Board

Context: Feed pulling, article processing, regeneration, and period digest
building run as BullMQ jobs. The acceptance walkthrough requires inspecting
queue state -
waiting, active, completed, and failed jobs, with their payloads and retry
history. That monitoring surface should be a ready-made tool rather than a
hand-built panel, it must be protected by basic-auth credentials from env, and
it should be possible to disable it by configuration.

Decision: Use Bull Board, the BullMQ-native dashboard. It is created over the
same queue instances the API already manages (`createBullBoard` with a
`BullMQAdapter` per queue from `QueuesService`) and mounted at `/admin/queues`
directly on the running NestJS Express instance via `HttpAdapterHost`, so it adds
no extra process or port. Access is gated by a small basic-auth middleware that
checks `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD` from env, and the whole mount
can be turned off with `BULL_BOARD_ENABLED=false`. It is wired through the Nest
lifecycle (`OnModuleInit`) so it comes up and shuts down with the API.

Alternatives:

- Building a custom in-app queue-monitoring UI. Rejected because job-state views,
  failed-job inspection, and retry/clean actions are already solved well by
  existing tooling; rebuilding them would add maintenance burden and bug risk in
  an operational tool, and the brief explicitly asks for a ready-made panel
  rather than a custom one.
- A different dashboard such as Arena or a hosted service like Taskforce.sh.
  Rejected because Bull Board is the actively maintained, BullMQ-native option
  that reads the exact queues we already create in-process, whereas the
  alternatives either target older Bull, are commercial/hosted, or require
  standing up a separate service - extra infrastructure for an internal admin
  view.
- Running Bull Board as its own standalone process. Rejected (mildly) because
  mounting it on the existing API instance means one fewer container to run and
  deploy and it shares the API's connection wiring and lifecycle; the accepted
  cost is that the admin view's availability is coupled to the API process.
- Protecting it with the app's own session/JWT auth instead of basic auth.
  Rejected because the brief specifies basic-auth-from-env for this panel, and an
  admin-only operational tool does not need per-user identity; a dependency-free
  env-credential gate is the simplest thing that meets the requirement.

Trade-offs: Bull Board gives BullMQ-native visibility into every queue with zero
added infrastructure, mounts inside the existing API process, and is kept
configurable and protected through env (enable flag plus basic-auth
credentials), satisfying the monitoring requirement directly. The costs are that
basic auth is coarse - a single shared credential rather than per-user access,
sent base64 on each request so it relies on TLS in transit, and shipped with
insecure defaults (`admin` / `change_me`) that must be overridden in env - that
mounting in-process couples the panel's uptime to the API, and that Bull Board
shows live queue state only: it complements, but does not replace, the structured
logs and `LlmTelemetry` used for historical and cost analysis.

See `AGENTS.md` for the full hackathon task brief and implementation requirements.

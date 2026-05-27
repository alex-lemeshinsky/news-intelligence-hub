# AGENTS.md

App-local instructions for `apps/worker`, the BullMQ background worker for News
Intelligence Hub.

Read the repository root `../../AGENTS.md` and `../../CLAUDE.md` before making
changes here. Those files define the product, acceptance checklist, stack
constraints, and competition scoring risks. This file adds worker-specific
guidance.

## What This App Does

The worker owns asynchronous and expensive work:

- Scheduled and manual feed pulling.
- RSS/Atom parsing, deterministic article validation, URL normalization, content
  hashing, and cheap pre-filtering.
- Article analysis jobs that call the LLM abstraction for summaries, entities,
  importance, categories, and axis labels.
- Regeneration jobs after axis changes.
- Digest jobs, where deterministic code selects facts and the LLM writes only
  the final overview.
- Incremental graph updates from persisted labels and entity mentions.

HTTP handlers in `apps/api` enqueue jobs; this app performs them. Keep that
boundary sharp.

## Architecture

Current files:

- `src/main.ts`: process entry point, Redis connection, queue and worker
  creation, dependency wiring, structured startup log, and graceful shutdown.
- `src/processors.ts`: queue dispatcher. It should route known queue/job names to
  focused processor functions and reject unknown work clearly.
- `src/feed-pull.processor.ts`: feed pull job implementation, article upsert,
  feed/article join persistence, deterministic pre-filter results, and feed
  status updates.
- `src/feed-parser.ts`: RSS/Atom parsing and mapping into the app's internal
  parsed item shape.
- `src/pre-filter.ts`: deterministic junk filtering and HTML stripping.
- `src/prisma-enums.ts`: local string enums used by the worker until generated
  Prisma enums are available in the build path.

Future processors should follow the same pattern:

- `article-processing.processor.ts`
- `regeneration.processor.ts`
- `digest.processor.ts`
- `graph-rebuild.processor.ts` if a separate graph rebuild job becomes useful.

Processor functions should accept dependencies as parameters. This keeps job
logic testable without Redis or a real database.

## Queue And Job Rules

- Use queue and job constants from `@nih/shared`; do not duplicate magic strings.
- Jobs must be idempotent. Retried jobs should update or upsert records without
  creating duplicate labels, mentions, graph edges, or telemetry rows.
- Every job payload that touches user-owned data must include enough tenant
  context to scope writes by user.
- Respect paused feeds and missing/deleted feeds.
- Update durable status fields when jobs fail so the UI can explain the failure.
- Use BullMQ retry/backoff settings from env or shared API enqueue options when
  adding new queues.
- LLM concurrency must be bounded by env, for example `LLM_CONCURRENCY`.

## Deterministic Work Vs LLM Work

Do in deterministic code:

- RSS/Atom parsing.
- URL normalization.
- Content hashing.
- Minimum-content and boilerplate pre-filtering.
- Exact duplicate detection by normalized URL and content hash.
- Selecting digest candidates, top categories, top entities, and graph edges from
  persisted labels.

Use the LLM only for semantic work:

- Article summary, entities, importance, category assignment, and axis labels.
- Fuzzy entity matching when deterministic alias rules are insufficient.
- Final digest overview text.

Never use the LLM for pre-filtering. Never introduce quadratic pairwise LLM calls
for deduplication or similarity.

## Database And Multi-Tenant Isolation

Use `@nih/database` for Prisma access from the worker entry point. Keep
processor-level database access behind small dependency interfaces so unit tests
can provide doubles.

Raw `Article` rows may be reused across users, but worker writes to these tables
must remain tenant-scoped:

- `ArticleLabel`
- `ArticleCategoryAssignment`
- `ArticleAxisAssignment`
- `Entity`
- `ArticleEntityMention`
- `ArticleSimilarity`
- `GraphEdge`
- `LlmTelemetry`
- `Digest`
- `RegenerationRun`
- `QueueJobRecord`

When a job receives both `userId` and `feedId`, verify the feed belongs to the
user before writing derived records.

## LLM And Cost Control

When implementing article analysis, regeneration, or digest processors:

- Call only the repository's LLM abstraction; do not call provider SDKs directly
  from arbitrary processor code.
- Choose provider and model from env.
- Validate structured model output before persistence.
- Cache LLM results by operation and content hash.
- Track prompt, completion, and total tokens by operation type.
- Write telemetry for successes and failures.
- On provider failure, retry with backoff and use the configured failover path if
  implemented.
- Store failed status and diagnostic context when retries are exhausted.

## Code Style

- TypeScript only, NodeNext ESM.
- Keep `.js` suffixes on local relative imports, as required by NodeNext output.
- Prefer pure helpers for parsing, normalization, hashing, filtering, and mapping.
- Use explicit dependency interfaces for processor functions instead of passing a
  giant untyped object.
- Avoid global mutable state outside the process entry point.
- Use structured JSON logs with stable event names, job IDs, queue names, entity
  IDs, article IDs, feed IDs, and user IDs where relevant.
- Keep shutdown handling complete: close workers, queues, Redis, and Prisma.
- Do not add secrets or generated credentials to source.
- Do not add non-printable Unicode characters.

## Testing

Use Node's built-in test runner through the app script:

- `npm --prefix apps/worker run test`

High-value tests for this app:

- Feed parsing skips malformed items and keeps useful metadata.
- URL normalization removes fragments, lowercases host/protocol, and sorts query
  parameters.
- Pre-filtering rejects empty, too-short, and obvious boilerplate content without
  LLM calls.
- Feed pull jobs are idempotent, tenant-scoped, and update feed status on
  success or failure.
- Article processing validates LLM output and never persists malformed data.
- Entity deduplication avoids false merges for ambiguous aliases.
- Regeneration and digest jobs update progress and telemetry.

Run from the repository root:

- `npm run lint:worker`
- `npm run build:worker`

Use `npm run lint` and `npm run build` before claiming repository-level
completion.

## Implementation Checklist For Agents

Before changing worker behavior:

1. Re-read the worker-related requirements in `../../AGENTS.md`.
2. Confirm the queue name, job name, and payload shape in `@nih/shared`.
3. Make job logic idempotent before adding retries or concurrency.
4. Keep deterministic filtering before any LLM work.
5. Add focused tests with dependency doubles.
6. Update `../../.env.example`, README, and ADRs when introducing new env values,
   queues, provider behavior, or externally visible worker behavior.

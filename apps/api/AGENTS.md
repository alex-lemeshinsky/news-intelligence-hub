# AGENTS.md

App-local instructions for `apps/api`, the NestJS backend for News Intelligence
Hub.

Read the repository root `../../AGENTS.md` and `../../CLAUDE.md` before making
changes here. Those files are the source of truth for product scope, acceptance
criteria, stack choices, and competition constraints. This file adds API-specific
guidance.

## What This App Does

The API owns synchronous product behavior:

- Registration, dev-mode email confirmation, login, logout, and current-user
  access control.
- Feed CRUD, category CRUD, classification-axis CRUD, article and graph read
  APIs, digest requests, regeneration requests, and telemetry read APIs.
- Queue submission for expensive work such as feed pulls, article analysis,
  regeneration, and digest building.
- Bull Board mounting and protection with basic auth credentials from env.

The API must not do expensive semantic work inside HTTP handlers. RSS pulling,
article processing, regeneration, digest building, and all LLM calls belong in
BullMQ jobs handled by `apps/worker`.

## Architecture

Use NestJS modules as feature boundaries. A module should group its controller,
service, DTOs, guards, and tests around a product capability, for example
`feeds`, `auth`, `articles`, `graph`, `axes`, `digests`, or `telemetry`.

Current core modules:

- `src/auth`: registration, confirmation, login, logout, password hashing, JWT
  issuing, and auth-related tests.
- `src/feeds`: feed validation, feed CRUD, tenant-scoped ownership checks, and
  manual feed-pull queueing.
- `src/queues`: BullMQ queue creation, shared queue names, enqueue helpers, and
  Bull Board integration.
- `src/database`: Prisma client lifecycle wrapper for NestJS.
- `src/users`: user ownership helpers.
- `src/articles`, `src/categories`, `src/axes`, `src/graph`, `src/llm`,
  `src/telemetry`, and `src/digests`: MVP feature modules that should grow in
  place instead of becoming unrelated utility folders.

Keep shared cross-app constants and payload shapes in `../../packages/shared`.
Keep Prisma schema changes in `../../packages/database`. The API can depend on
those packages, but shared packages must not import API code.

## HTTP And Queue Boundaries

- Controllers should be thin: parse input, identify the current user, call a
  service, and return a response.
- Services own business rules, tenant isolation, Prisma calls, and queue
  submission.
- Long-running work must enqueue a BullMQ job and return quickly with a job or
  run status.
- Do not call OpenAI, Anthropic, or any LLM adapter from controllers or request
  handlers.
- Queue names and job names must come from `@nih/shared`.
- Manual feed pulls should enqueue `QUEUE_NAMES.feedPull` with
  `JOB_NAMES.pullFeed`; future article processing, regeneration, and digest
  requests should follow the same shared-constant pattern.

## Multi-User Isolation

Every user-owned query must scope by `userId` in the database layer, not only in
the UI. Raw articles can be reused across users, but labels, categories, axes,
entities, graph edges, digests, telemetry rows, regeneration runs, and queue job
records are per-user.

Do not trust client-supplied ownership IDs. Early scaffolded endpoints may use
`x-user-id` for development, but production-quality endpoints should derive the
current user from the auth cookie/JWT through a guard or decorator.

## Data And Validation

- Use Prisma through `DatabaseService`; do not instantiate `PrismaClient`
  directly inside feature services.
- Use explicit DTOs or narrow TypeScript interfaces for request bodies and job
  payloads. Validate external input before persistence.
- Normalize emails and URLs in deterministic code.
- Use database uniqueness constraints for tenant-safe invariants, then translate
  expected Prisma errors into clear HTTP exceptions.
- Never persist invalid LLM output. Provider responses must be parsed and
  validated in the LLM abstraction before any database write.

## Configuration And Secrets

All operational values come from env and must be documented in
`../../.env.example` when introduced:

- JWT secrets and cookie settings.
- Redis URLs and queue retention settings.
- Bull Board enablement and basic auth credentials.
- LLM provider, model, timeout, token limits, concurrency, and failover toggles.
- Feed validation timeouts and filtering thresholds if used by the API.

Do not commit secrets, generated credentials, real tokens, or production URLs.
Development fallbacks are acceptable only when they are clearly insecure defaults
and documented as such.

## Code Style

- TypeScript only.
- Follow the repository linting intent and Google TypeScript style principles:
  small focused files, explicit exports, no dead code, no unused imports, and
  clear names over clever abbreviations.
- Prefer constructor injection over module-level mutable state.
- Keep functions short enough to test directly. Extract pure helpers for
  normalization, parsing, authorization checks, and DTO mapping.
- Use NestJS exceptions for expected HTTP failures.
- Use structured logs for operational events. Avoid context-free `console.log`
  messages; log identifiers such as `userId`, `feedId`, `articleId`, `queue`,
  `jobName`, and outcome.
- Keep generated output such as `dist/`, coverage, and local caches out of source
  changes unless the user explicitly asks otherwise.
- Do not add non-printable Unicode characters.

## Testing

Use Jest for API tests.

High-value tests for this app:

- Auth registration, confirmation, login, cookie behavior, and unconfirmed-user
  rejection.
- Tenant isolation in every service that reads or writes user-owned data.
- Feed validation, feed CRUD, pause/resume/delete behavior, and manual queueing.
- Queue service behavior, unknown queue rejection, and Bull Board auth behavior.
- LLM adapter response parsing and validation once adapters are implemented.
- Error translation for expected Prisma and external-service failures.

Run from the repository root:

- `npm run test:api`
- `npm run lint:api`
- `npm run build:api`

For broader verification, prefer `npm run lint` and `npm run build`.

## Implementation Checklist For Agents

Before changing API behavior:

1. Re-read the relevant root requirements in `../../AGENTS.md`.
2. Inspect the existing module and tests before adding new files.
3. Keep request work short and queue expensive work.
4. Scope all user-owned data by current user.
5. Add or update tests around the behavior you changed.
6. Update `../../.env.example` and README/ADR notes when new configuration,
   architecture decisions, or externally visible behavior are introduced.

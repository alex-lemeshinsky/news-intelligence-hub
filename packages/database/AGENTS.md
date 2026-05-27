# AGENTS.md

Package-local instructions for `packages/database`, the Prisma/PostgreSQL data
model package for News Intelligence Hub.

Read the repository root `../../AGENTS.md` and `../../CLAUDE.md` before making
changes here. Root instructions define the product, acceptance checklist, stack
constraints, and repository-wide quality rules. This file adds database-specific
guidance.

## What This Package Does

`@nih/database` owns the PostgreSQL schema and the shared Prisma client helper:

- Prisma schema for users, feeds, articles, per-user labels, categories, axes,
  entities, graph edges, LLM cache, telemetry, digests, regeneration runs, and
  queue job records.
- Prisma migrations for reproducible database setup.
- A small Prisma client singleton helper used by runtime packages that need a
  direct Prisma client, currently the worker.

This package does not own product workflows. Business rules live in `apps/api`
and `apps/worker`; the database package defines durable shape, constraints,
indexes, and safe client access.

## Architecture

Current files:

- `prisma/schema.prisma`: canonical database schema.
- `prisma/migrations/*`: committed migration history.
- `src/index.ts`: exports `getPrismaClient()` and
  `disconnectPrismaClient()` for process-level Prisma lifecycle management.

Keep the dependency direction simple:

- Apps and workers may import `@nih/database`.
- `@nih/database` must not import from `apps/*`.
- Prefer keeping cross-app enum and payload contracts in `../shared` only when
  they are not Prisma-specific.

## Schema Design Principles

- PostgreSQL is the selected database. Do not reopen the database choice unless
  the user explicitly asks.
- Model tenant isolation in schema and queries. User-owned tables need `userId`
  indexes, and uniqueness constraints should include `userId` where names or
  relationships are per-user.
- Raw `Article` rows may be shared across users; per-user labels, categories,
  axes, entities, graph edges, digests, telemetry, regeneration runs, and queue
  records must stay isolated.
- Keep exact duplicate support efficient with `Article.normalizedUrl` and
  `Article.contentHash`.
- Keep LLM cost controls durable with `LlmCache` and `LlmTelemetry`.
- Entity records should support aliases, descriptions, mentioning articles via
  joins, and Unix-second first/last seen values.
- Graph edges should remain queryable by user, kind, category, and time.
- Use `onDelete` behavior intentionally. Cascade user-owned configuration and
  labels; avoid accidental deletion of shared raw article records.
- Add indexes for query paths that are part of the acceptance walkthrough, not
  speculative bonus features.

## Migration Rules

- Schema changes must include a Prisma migration.
- Do not edit committed migration files after they have been shared unless the
  user explicitly asks for history surgery.
- Run `npm run db:generate` after schema changes so generated Prisma types match
  the schema.
- Prefer additive migrations while the project is in active development.
- When changing enum values, update all app code, worker code, shared constants,
  seed data, and documentation in the same change.
- Keep migration names descriptive and tied to the behavior being added.

## Prisma Client Rules

- Use `getPrismaClient()` for long-running standalone processes that need a
  shared Prisma instance.
- Use `disconnectPrismaClient()` during worker shutdown and scripts.
- NestJS API code should use its own `DatabaseService` wrapper in `apps/api` so
  Nest lifecycle hooks own connection management there.
- Do not create fresh `new PrismaClient()` instances inside hot paths,
  processors, or request handlers.
- Do not put business rules or tenant authorization in this package's client
  helper. Enforce those in API and worker services close to the use case.

## Configuration And Secrets

`DATABASE_URL` is required by Prisma and must be documented in
`../../.env.example`.

Do not commit real database URLs, passwords, credentials, seed secrets, or
production snapshots. Development defaults belong in `.env.example` comments or
Docker Compose defaults, not in application source.

## Code Style

- TypeScript only in `src/`.
- NodeNext ESM for this package.
- Keep exported helpers tiny and lifecycle-focused.
- Avoid broad data-access wrappers until the API or worker has a repeated,
  tested need for one.
- Keep Prisma model and field names explicit and domain-oriented.
- Do not manually edit generated files in `dist/` or generated Prisma client
  output.
- Do not add non-printable Unicode characters.

## Testing And Verification

Run from the repository root:

- `npm run lint:database`
- `npm run build:database`
- `npm run db:generate` after schema changes

When schema changes affect runtime behavior, also run relevant consumers:

- `npm run test:api`
- `npm run lint:api`
- `npm run lint:worker`
- `npm run build`

High-value database verification:

- Prisma schema validates and generates.
- Migrations apply on a clean PostgreSQL database.
- Tenant uniqueness constraints prevent cross-user data collisions.
- Expected cascade/delete behavior matches user stories, especially feed deletion
  preserving already processed raw articles.

## Implementation Checklist For Agents

Before changing the database package:

1. Re-read the data-model and multi-tenant requirements in `../../AGENTS.md`.
2. Identify which API or worker behavior needs the schema change.
3. Add schema fields, relations, indexes, and constraints deliberately.
4. Generate and commit a migration for schema changes.
5. Update Prisma-generated types and all affected consumers.
6. Run database checks and relevant API/worker tests.
7. Update README ADRs if the schema change affects documented architecture,
   deduplication, caching, entity matching, graph construction, or telemetry.

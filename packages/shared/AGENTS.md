# AGENTS.md

Package-local instructions for `packages/shared`, the shared TypeScript contract
package for News Intelligence Hub.

Read the repository root `../../AGENTS.md` and `../../CLAUDE.md` before making
changes here. Root instructions define the product, acceptance checklist, stack
constraints, and repository-wide quality rules. This file adds package-specific
guidance.

## What This Package Does

`@nih/shared` contains small, stable contracts used by more than one workspace:

- BullMQ queue names and job names.
- Job payload shapes shared between `apps/api` and `apps/worker`.
- Domain constants and literal-union types used by API, worker, and web code.
- Future cross-app DTOs or response contracts that are intentionally independent
  of any single app framework.

This package should stay boring and dependency-light. It is a contract layer, not
a business-logic package.

## Architecture

Current entry point:

- `src/index.ts`: exports queue constants, job constants, queue payload types,
  entity type constants, article importance constants, and graph edge kind
  constants.

Keep exports deliberate and stable:

- Add values here when at least two workspaces need the same contract.
- Keep app-specific DTOs inside the owning app until sharing is clearly useful.
- Prefer literal `as const` arrays or objects plus derived union types.
- Avoid re-exporting framework types from NestJS, Next.js, BullMQ, Prisma, or
  provider SDKs.
- Do not import from `apps/*`; shared packages must remain below app code in the
  dependency graph.

If the package grows, split by domain under `src/` and re-export from
`src/index.ts`, for example:

- `src/queues.ts`
- `src/articles.ts`
- `src/entities.ts`
- `src/graph.ts`
- `src/llm.ts`

Do not create broad utility files with unrelated helpers.

## Contract Design Rules

- Queue names and job names are public contracts. Changing them can orphan jobs
  in Redis and break the API-worker boundary.
- Job payloads must include tenant context when they touch user-owned data.
- Shared domain constants must match the implemented behavior, not aspirational
  UI labels.
- Keep casing differences explicit. Prisma enums currently use uppercase values,
  while some UI-facing constants may use lowercase values; map between them in
  app code instead of silently changing shared values.
- Add new queue payload interfaces next to the job name they support.
- Version-like breaking changes should be coordinated across all consumers in
  the same commit.

## Code Style

- TypeScript only.
- Keep the package free of runtime dependencies unless there is a strong,
  cross-app reason.
- Prefer named exports.
- Keep types serializable when they cross queues or HTTP boundaries.
- Do not export functions that perform I/O, access env, mutate globals, or depend
  on process state.
- Avoid `any`; use narrow literal types and interfaces.
- Keep generated output such as `dist/` out of manual edits.
- Do not add secrets, generated credentials, real tokens, or non-printable
  Unicode characters.

## Testing And Verification

This package currently uses TypeScript compilation as its verification path.

Run from the repository root:

- `npm run lint:shared`
- `npm run build:shared`

When changing shared contracts, also run the consumers that compile against them:

- `npm run lint:api`
- `npm run lint:worker`
- `npm run lint:web` if frontend imports were affected

For repository-level confidence, use:

- `npm run lint`
- `npm run build`

## Implementation Checklist For Agents

Before changing shared contracts:

1. Confirm the contract is needed by multiple workspaces.
2. Check existing app and worker imports to avoid breaking queue or DTO names.
3. Add the smallest type or constant that solves the current need.
4. Update all consumers in the same change.
5. Run the shared package check and relevant consumer checks.
6. Update app/package `AGENTS.md`, README, or ADR notes if the change alters a
   documented architecture boundary.

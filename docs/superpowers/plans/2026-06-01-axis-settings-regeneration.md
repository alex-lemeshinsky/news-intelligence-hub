# Axis Settings Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped classification-axis settings and background regeneration so reviewers can edit axes, queue relabelling, keep using the app, and see progress.

**Architecture:** Axes remain per-user database records behind authenticated NestJS endpoints. Regeneration is represented by `RegenerationRun`, queued through BullMQ, and processed by the worker by reusing article-processing logic with the regeneration operation/cache namespace.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ, Next.js App Router, Tailwind CSS, TypeScript.

---

### Task 1: Axes CRUD API

**Files:**
- Modify: `apps/api/src/axes/axes.service.ts`
- Create: `apps/api/src/axes/axes.controller.ts`
- Modify: `apps/api/src/axes/axes.module.ts`
- Test: `apps/api/src/axes/axes.service.spec.ts`

- [ ] Write service tests for list/create/update/delete with user ownership and value normalization.
- [ ] Run `npm --prefix apps/api run test -- axes.service.spec.ts` and confirm the tests fail because the service is empty.
- [ ] Implement `AxesService` and `AxesController` using existing category/auth patterns.
- [ ] Run the focused test and commit `feat(api): add axis settings crud`.

### Task 2: Settings UI

**Files:**
- Modify: `apps/web/src/lib/api/types.ts`
- Modify: `apps/web/src/app/(workspace)/layout.tsx`
- Create: `apps/web/src/app/(workspace)/workspace/settings/page.tsx`
- Create: `apps/web/src/app/(workspace)/workspace/settings/settings-client.tsx`

- [ ] Add typed axis contracts for the web API.
- [ ] Add a settings route and navigation link.
- [ ] Build a compact Tailwind editor for axis names and comma-separated values, plus create/delete actions.
- [ ] Run `npm run lint:web` and commit `feat(web): add axis settings ui`.

### Task 3: Regeneration Queue API

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/axes/axes.service.ts`
- Modify: `apps/api/src/axes/axes.controller.ts`
- Test: `apps/api/src/axes/axes.service.spec.ts`

- [ ] Write tests for starting a regeneration run, selecting processable labels, and enqueueing one regeneration job.
- [ ] Run the focused test and confirm the regeneration assertions fail.
- [ ] Implement `startRegeneration` and run lookup endpoints.
- [ ] Run focused tests and commit `feat(api): queue axis regeneration runs`.

### Task 4: Worker Regeneration Processor

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/worker/src/article-processing.processor.ts`
- Modify: `apps/worker/src/processors.ts`
- Test: `apps/worker/src/article-processing.processor.spec.ts`

- [ ] Add tests proving regeneration uses the regeneration operation/cache namespace and updates run counters.
- [ ] Run `npm --prefix apps/worker run test` and confirm the new tests fail.
- [ ] Refactor article processing to accept operation/run metadata and process regeneration jobs.
- [ ] Run worker tests and commit `feat(worker): process regeneration jobs`.

### Task 5: Regeneration Progress UI

**Files:**
- Modify: `apps/web/src/lib/api/types.ts`
- Modify: `apps/web/src/app/(workspace)/workspace/settings/page.tsx`
- Modify: `apps/web/src/app/(workspace)/workspace/settings/settings-client.tsx`

- [ ] Add regeneration run types and fetch the latest run.
- [ ] Add a regenerate action and progress panel that refreshes without blocking settings edits.
- [ ] Run `npm run lint:web` and commit `feat(web): show regeneration progress`.

### Task 6: Verification And Cleanup

**Files:**
- Update tests as needed in `apps/api/src/axes` and `apps/worker/src`.
- Update source files touched above only for lint/type issues.

- [ ] Run `npm run test`.
- [ ] Run `npm run lint:ci`.
- [ ] Inspect `git status --short`.
- [ ] Commit any final test/cleanup changes as `test: cover axis regeneration flow`.

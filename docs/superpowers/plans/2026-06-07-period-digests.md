# Period Digests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an end-to-end period digest workflow where users request a day, week, or month digest scoped by categories/entities and the worker builds it asynchronously.

**Architecture:** The API creates tenant-scoped `Digest` records and enqueues `digest/build-digest` jobs. The worker deterministically selects top categories, entities, and key articles, then calls the existing LLM abstraction only to write the final overview and records digest telemetry.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ, Next.js App Router, React client components, Tailwind CSS, Jest, Node test runner.

---

### Task 1: Shared Payload And API Request Flow

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/digests/digests.controller.ts`
- Modify: `apps/api/src/digests/digests.module.ts`
- Modify: `apps/api/src/digests/digests.service.ts`
- Test: `apps/api/src/digests/digests.service.spec.ts`
- Test: `apps/api/src/digests/digests.controller.spec.ts`

- [ ] **Step 1: Write failing API tests**

Cover creating a digest with normalized scope, rejecting foreign category/entity IDs, listing only the current user's digests, and reading one digest by owner.

- [ ] **Step 2: Run API digest tests to verify they fail**

Run: `npm --prefix apps/api run test -- digests`

- [ ] **Step 3: Implement API service/controller**

Use `CookieAuthGuard`, `CurrentUser`, `QUEUE_NAMES.digest`, and `JOB_NAMES.buildDigest`. Keep request work short: create the record, enqueue the job, and return the queued digest.

- [ ] **Step 4: Run API tests to verify they pass**

Run: `npm --prefix apps/api run test -- digests`

### Task 2: Worker Digest Processor

**Files:**
- Modify: `apps/worker/src/llm-client.ts`
- Create: `apps/worker/src/digest.processor.ts`
- Modify: `apps/worker/src/processors.ts`
- Modify: `apps/worker/src/main.ts`
- Test: `apps/worker/src/digest.processor.spec.ts`

- [ ] **Step 1: Write failing worker tests**

Cover deterministic candidate selection, completed digest persistence, telemetry on LLM success, deterministic empty digest completion without an LLM call, and failed status on invalid LLM output.

- [ ] **Step 2: Run worker digest tests to verify they fail**

Run: `npm --prefix apps/worker run test -- digest.processor.spec.ts`

- [ ] **Step 3: Implement digest LLM operation and processor**

Add `buildDigest` to the configured LLM client. The processor updates `Digest.status`, stores deterministic facts in `scopeJson`, persists `overview`, and records `LlmOperation.DIGEST` telemetry.

- [ ] **Step 4: Run worker tests to verify they pass**

Run: `npm --prefix apps/worker run test -- digest.processor.spec.ts`

### Task 3: Web Digest Page

**Files:**
- Modify: `apps/web/src/lib/api/types.ts`
- Modify: `apps/web/src/app/(workspace)/layout.tsx`
- Create: `apps/web/src/app/(workspace)/workspace/digests/page.tsx`
- Create: `apps/web/src/app/(workspace)/workspace/digests/digests-client.tsx`

- [ ] **Step 1: Add typed API models**

Add digest period, status, facts, request, and response types matching the API response.

- [ ] **Step 2: Build the page and client form**

Fetch categories and digest list on the server. Let users choose a period plus optional category/entity scope text, submit a digest request, refresh the list, and show completed facts and overview.

- [ ] **Step 3: Add navigation**

Add a `Digests` item to the workspace nav next to Feed, Graph, and Settings.

### Task 4: Full Verification

**Files:**
- No source edits expected unless verification finds bugs.

- [ ] **Step 1: Run focused checks**

Run: `npm --prefix apps/api run test -- digests`, `npm --prefix apps/worker run test -- digest.processor.spec.ts`.

- [ ] **Step 2: Run repository checks**

Run: `npm run lint`, `npm run build`, and `npm run test`.

- [ ] **Step 3: Rebuild and test through plugins**

Run: `docker compose up --build -d`. Use Browser to log in, open `/workspace/digests`, submit a digest, confirm queued/completed UI and responsive layout. Use Computer Use for a safe desktop-state inspection without mutating unrelated user apps.

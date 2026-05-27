# AGENTS.md

App-local instructions for `apps/web`, the Next.js frontend for News
Intelligence Hub.

Read the repository root `../../AGENTS.md` and `../../CLAUDE.md` before making
changes here. Those files define the product scope, acceptance checklist, stack
constraints, and scoring risks. This file adds frontend-specific guidance.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16.2.6 with React 19. Before writing framework-specific
code, read the relevant guide in `node_modules/next/dist/docs/` for the API or
convention you are touching. Heed deprecation notices and do not rely only on
older Next.js training-data assumptions.
<!-- END:nextjs-agent-rules -->

## What This App Does

The web app is the user-facing workspace for News Intelligence Hub:

- Registration, dev-mode email confirmation, login, logout, and session-aware
  navigation.
- Feed management with feed status, pause/resume/delete, and manual pull action.
- Category and classification-axis settings, including regeneration controls.
- Article feed with filters, summaries, entities, categories, importance,
  processing state, and duplicate/similar counters.
- Article and entity detail panels.
- Relationship graph built with React Flow.
- Digest request and digest display if implemented.
- LLM telemetry dashboard or summary if implemented.
- Admin link to Bull Board only when enabled by env and protected by the API.

The web app must not call LLM providers, Prisma, Redis, or BullMQ directly. It
talks to `apps/api` over documented HTTP endpoints.

## Architecture

Use the Next.js App Router under `src/app`. Prefer colocating route-specific UI
near the route and extracting reusable components only when more than one route
needs them.

Recommended structure as the UI grows:

- `src/app/(auth)`: register, confirm, login, and logout flows.
- `src/app/(workspace)`: authenticated product shell.
- `src/app/(workspace)/feeds`: feed CRUD and pull controls.
- `src/app/(workspace)/articles`: article feed, filters, and article details.
- `src/app/(workspace)/graph`: React Flow graph view and node detail panel.
- `src/app/(workspace)/settings`: categories, axes, regeneration controls, and
  telemetry.
- `src/app/(workspace)/digests`: digest requests and results.
- `src/components`: reusable UI primitives and feature components.
- `src/lib/api`: typed API client, fetch helpers, and response parsing.
- `src/lib/types`: frontend-only view models when shared types are not enough.

Keep shared cross-app types in `../../packages/shared` when the API, worker, and
web app all need the same contract.

## Data Fetching And State

- Use the API as the source of truth. Do not duplicate business rules in the UI.
- Preserve tenant isolation by relying on authenticated API calls; never send a
  user selector as a substitute for auth.
- Keep server-rendered data fetching for initial page loads where it improves
  stability, and use client components for interactive filters, forms, graph
  manipulation, and optimistic UI.
- Treat background work as asynchronous: show queued/running/failed/completed
  states for feed pulls, regeneration, and digests.
- Keep API error messages helpful but do not leak secrets, stack traces, provider
  payloads, or raw credentials.

## UI And UX Standards

- Build the actual app workspace, not a marketing landing page.
- Use Tailwind CSS for styling.
- Keep the UI minimal, tidy, responsive, and information-dense enough for a news
  analysis tool.
- Prefer predictable operational layouts: sidebar or top navigation, filter
  bars, tables/lists, detail panels, settings forms, and graph controls.
- Use controls that match intent: buttons for commands, toggles for booleans,
  segmented controls or tabs for modes, selects/menus for option sets, sliders
  only for numeric ranges such as graph timeline mode.
- Avoid visible instructional copy that explains obvious UI mechanics.
- Make loading, empty, error, queued, processing, and filtered states explicit.
- Preserve the distinction between deterministic filtered articles and LLM
  labelled junk.
- Test responsive behavior on mobile and desktop viewports before claiming the UI
  is finished.

## Graph UI

React Flow is mandatory for the relationship graph. When implementing it:

- Model node kinds as `article` and `entity`.
- Model edge kinds as `mentions`, `co_mention`, and optional `similar`.
- Include required filters for node type and category.
- Prefer URL/query state or local component state for view filters; do not make
  every pan/zoom or hover interaction hit the API.
- Keep graph data bounded for MVP review data and add server-side filters before
  the graph becomes too large.
- Clicking a node should open a detail panel instead of navigating away
  unexpectedly.

## Code Style

- TypeScript everywhere.
- Use strict types and avoid `any`; define narrow API response and view-model
  types.
- Prefer named components and named helper functions.
- Keep server and client component boundaries explicit. Add `"use client"` only
  to files that need browser APIs, state, effects, or event handlers.
- Keep forms accessible with labels, validation messages, disabled states, and
  keyboard-friendly controls.
- Use Tailwind utility classes consistently; extract components to remove
  meaningful duplication, not to hide one-off styling.
- Do not hard-code operational URLs or credentials. Read public frontend config
  from documented env variables.
- Do not add non-printable Unicode characters.

## Styling Guidance

- Keep palettes restrained but not one-note. Avoid a page dominated by only one
  hue family.
- Use stable dimensions for cards, filters, graph panels, counters, and controls
  so dynamic data does not cause layout jumps.
- Keep text within containers at mobile and desktop widths.
- Use app-appropriate icons when an icon library is introduced; do not create
  custom SVG icons for common actions if a maintained icon exists.
- Do not keep default Next.js starter visuals, copy, or external template links
  in product screens.

## Testing And Verification

Run from the repository root:

- `npm run lint:web`
- `npm run build:web`

When significant UI exists, verify in a browser:

- Registration through confirmation and login.
- Feed CRUD and manual pull.
- Article feed filters and article detail panel.
- Graph rendering, filters, and node detail panel.
- Axis edits and regeneration progress.
- Digest request flow if implemented.
- Responsive layout at mobile and desktop widths.

If a local dev server is needed, use:

- `npm run dev:web`

## Implementation Checklist For Agents

Before changing web behavior:

1. Re-read the relevant root requirements in `../../AGENTS.md`.
2. Check Next.js 16 docs in `node_modules/next/dist/docs/` for APIs you touch.
3. Keep API calls typed and centralized.
4. Represent background jobs as asynchronous UI states.
5. Keep LLM, database, queue, and secret handling out of frontend code.
6. Run lint/build and visually check important responsive screens.

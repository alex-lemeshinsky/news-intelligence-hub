# AGENTS.md

This repository is for the UA-Skills AI-Skills Prompt Engineering Competition project:
News Intelligence Hub.

Source task page: https://ua-skills.com/tournaments/ai-skills-prompt-engineering-competition

Event metadata:
- Event: AI-Skills, Prompt Engineering Competition
- Project title: UA-Skills: News Intelligence Hub
- Dates shown on UA-Skills: May 25, 2026 to June 12, 2026
- Prize pool: 5,000 USD, top 5 places
- Public stack badges: Node.js, TypeScript, React, Tailwind CSS

Important operating rule for agents:
- Do not treat the hackathon brief as a one-shot prompt to blindly implement.
- The event rewards engineering judgment: read requirements, design deliberately, review generated code, reject weak output, and keep the solution explainable.
- Do not paste raw passages from the UA-Skills specification into source files or the README. The original specification warns that document-integrity markers are monitored. Paraphrase requirements and keep documentation project-specific.
- Do not add secrets, API keys, passwords, generated credentials, or real tokens to the repository.
- Code and documentation must not contain non-printable Unicode characters such as zero-width characters, BOMs, or directional marks.

## Product Summary

News Intelligence Hub is a multi-user tool that aggregates technical and industry news from RSS/Atom feeds and turns articles into an analyzable relationship graph.

Users add the feeds they care about. The system pulls articles, filters obvious junk before spending LLM tokens, analyzes useful content with an LLM, extracts entities, assigns categories and classification axes, deduplicates articles and entities, and displays the result as both a feed and a graph.

The product is not a generic RSS reader. Its value is context: which companies, public figures, products, technologies, locations, topics, and articles are connected over time.

Core example use cases:
- Relationship analytics: track co-mentions such as public figures with crypto projects, companies with technologies, and frequency changes over time.
- Personal feed: users define their own categories and filter by source, importance, category, and period.
- Period digests: users request daily, weekly, or monthly summaries scoped by category or entity.

Out of MVP scope:
- Social graph between users.
- Sharing feeds between users.
- Push, email, or Telegram notifications.
- Mobile app.
- Payments.
- ML models trained on user data.
- CSV/JSON export is optional bonus scope, not a required MVP feature.

## Required Technology Constraints

Mandatory:
- TypeScript everywhere.
- Google TypeScript Style Guide enforced by linting.
- Tailwind CSS for UI styling.
- react-flow for the graph UI.
- BullMQ and Redis for queues.
- Bull Board or equivalent for queue monitoring.
- Docker and docker compose for one-command startup.
- Own LLM abstraction with both OpenAI and Anthropic adapters.
- Active LLM provider and model selected through environment variables.

Participant choices that must be justified in README ADRs:
- Backend: NestJS or Directus.
- Frontend: React or Next.js.
- Database: PostgreSQL or MySQL.

Constraints:
- Do not make LangChain, LlamaIndex, or another high-level LLM framework the architecture. Such libraries may only be used if every part used is understood and justified.
- No direct LLM calls from HTTP handlers. LLM work must go through the queue.
- No hard-coded operational configuration. Token limits, pull schedules, model names, worker counts, concurrency, credentials, and URLs must come from environment variables or documented config.
- `.env.example` is mandatory and must list every variable with comments and no real secrets.

## Must / Should / Could Scope

Must have for acceptance:
- Registration, email confirmation in dev mode, login, logout.
- Multi-user data isolation.
- Feed CRUD with feed status.
- Category CRUD.
- Classification-axis CRUD with 4 to 5 seeded axes.
- Scheduled and manual feed pulling worker.
- Article processing worker: deterministic pre-filter, then LLM analysis for entities, summary, importance, categories, and axes.
- LLM abstraction with OpenAI and Anthropic adapters, switchable by env.
- Article deduplication across feeds and an "N similar" counter.
- Entity deduplication.
- Cost control: per-article token limit, LLM result cache, heuristic pre-filter.
- Structured logs.
- Basic LLM spend telemetry: calls and token counts.
- Article feed with filters and article cards.
- Graph page using react-flow, typed edges, and filters by node type and category.
- Axis settings UI with regeneration action.
- Bull Board or equivalent wired into the stack.
- One-command startup with docker compose.
- README with startup guide and Architectural Decisions.
- Responsive, tidy, minimal Tailwind UI.

Should have for stronger scoring:
- Failover between LLM providers when one fails.
- Meaningful unit tests for critical logic.
- Graph filters by time window and text search.
- Period digests.
- UI view or dashboard for aggregated LLM telemetry.

Could have for bonus points:
- Edge animation over time.
- Graph timeline mode with a slider.
- Visual graph clustering by category.
- Dashboard of top entities and categories for a period.
- Full-text article search.
- Graph export.
- Semantic similarity between articles.

## User Stories

US-1 Registration and email confirmation:
- User registers with email and password.
- In dev mode, no real SMTP is required. Confirmation link appears in service logs and/or the post-registration UI, clearly marked as dev mode.
- Unconfirmed users cannot use the app except for confirmation resend flow.

US-2 Login and logout:
- Confirmed user can log in, log out, and log back in.
- Session survives page reload.

US-3 Feed management:
- User adds RSS/Atom feed by URL.
- System validates format and reachability.
- Feed status is visible: active, paused, or pull error with description.
- User can pause, resume, or delete a feed.
- Deleting a feed detaches it as a live source but does not delete already processed articles.

US-4 Category management:
- User creates and edits categories such as AI infra, crypto regulation, or DevTools.
- Categories are user config and are created without LLM involvement.
- New articles are classified against the user's categories.

US-5 Classification axes:
- Settings contain 4 to 5 seeded axes, for example content type, reader level, region, and tone.
- Axes and values are editable: rename, add value, remove value, delete axis, add axis.
- Axes are not hard-coded. Users and participants may define arbitrary axes and values.

US-6 Regeneration:
- After axis changes, user can regenerate existing article labels.
- Regeneration is queued, shows progress, and does not block app usage.
- Regeneration LLM cost appears in telemetry.

US-7 Article feed:
- Articles are sorted by publication time.
- Filters include category, feed, importance, processing state, and time window.
- Feed rows/cards show title, source, date, summary, entities, categories, importance, processing state, and similar-material counter.
- Importance labels include important/high, normal, and junk/filtered states. Preserve a clear distinction between deterministic pre-filtered articles and LLM-labelled junk.

US-8 Article card:
- Opens from the feed.
- Shows full LLM summary, original link, extracted entities with types, assigned categories, assigned axes, and similar/duplicate articles from other feeds.

US-9 Relationship graph:
- Interactive react-flow visualization.
- Node kinds: article and entity.
- Edge kinds: article mentions entity, entities co-mentioned, and optionally articles semantically similar.
- Mandatory filters: node type and category.
- Optional filters: time window and text search.
- Clicking a node opens a side panel with details.
- Graph remains responsive at MVP data scale.

US-10 Entity card:
- Opens from graph or article card.
- Shows entity type, short description if available, mentioning articles, related entities with co-mention counts, and mention activity over time.

US-11 Period digest:
- User requests day, week, or month digest scoped to categories or entities.
- Digest includes top entities, top categories, key articles, and a short LLM-written overview.

US-12 Queue monitoring:
- Bull Board or equivalent is protected with basic auth credentials from env.
- App may expose an "Open queues" admin link behind an env flag.
- Queue panel should be a ready-made tool, not custom-built inside the app.

## Architecture Principles

Principle 1: The LLM is a precision tool.
- Use deterministic code for RSS/Atom parsing, metadata extraction, URL normalization, content hashing, obvious junk filtering, schedules, retries, caches, queue orchestration, and graph construction from labelled data.
- Use the LLM for semantic tasks: entity extraction, summary generation, importance classification, category and axis assignment, fuzzy entity matching, and optional semantic article similarity.
- Using the LLM for work that is easily deterministic lowers the architecture score.
- The deterministic-vs-LLM split must be explained in ADRs.

Principle 2: Fail loudly and degrade gracefully.
- External failures must not collapse the whole app.
- Feed errors update feed status while other feeds keep working.
- LLM failures should retry with backoff, fail over to the second provider if implemented, or leave articles awaiting processing for later retry.
- Unrecoverable errors are logged with structured context.

Principle 3: Expensive or long work goes through queues.
- Feed pulling, article processing, regeneration, and digest building must run through BullMQ.
- HTTP handlers must not wait on long processing.
- Feed, graph, settings, and cards remain usable during background work.

Principle 4: Multi-tenant isolation.
- User A must never see user B feeds, categories, article assignments, graph, or labels.
- Isolation belongs in data-access/business rules, not only UI filters.
- Raw articles may be reused across users for cost/storage efficiency, but per-user labels, categories, axes, and graph projections remain isolated.

Principle 5: Reproducible env-driven setup.
- On a clean Docker machine, the app starts with docker compose after filling `.env` from `.env.example`.
- Required services include database, Redis, API/backend, frontend or SSR server, workers, and Bull Board.
- Migrations and seed data run automatically at startup or via one documented command.
- Seeded axes and demo data/feed must let reviewers see a working graph within minutes.

## Functional Requirements

FR-1 System composition:
- Frontend.
- Backend API.
- Background workers.
- Database.
- Redis and BullMQ queues.
- Queue monitoring.
- LLM abstraction layer.

FR-2 Article processing pipeline:
- Article enters through feed pull or demo data.
- Cheap deterministic validation/filtering happens before any LLM call.
- Store filtered articles with a filtered status and skip LLM work.
- Cache LLM results by content hash.
- Update graph incrementally after successful labelling; avoid full recompute for every article.

FR-3 LLM abstraction:
- Provide one provider-agnostic service interface.
- Provide OpenAI and Anthropic adapters.
- Each adapter owns request shaping, response parsing, validation, timeouts, and errors.
- Responses must be structured JSON or structured output and validated before persistence.
- Invalid model output must not reach the database.
- Article analysis should return extracted entities, summary, importance, categories, and axes in one call.
- Additional operations include entity matching and digest generation.

FR-4 Heuristic pre-filter:
- Deterministic only; LLM use is forbidden here.
- Reject empty content, too-short content, missing extractable text, and obvious boilerplate/SEO junk.
- Filtering criteria must be configurable through env or config.
- Filtered articles are stored with status and excluded from LLM processing.

FR-5 Article deduplication:
- Detect exact duplicates by normalized URL.
- Detect exact content duplicates by content hash.
- Optional semantic similarity must be economical and must not use pairwise LLM calls across all articles.
- Feed and article card must show a similar/duplicate counter and list.
- README/ADR must explain the distinction between duplicate and similar.

FR-6 Entity deduplication:
- Different names for the same entity should collapse to one canonical entity with aliases.
- Must handle examples such as Microsoft, MSFT, Microsoft Corp., Cyrillic spelling, and context-sensitive "MS".
- Store canonical name, type, aliases, description, article IDs where mentioned, firstSeen, and lastSeen.
- `mentionArticleIds` should be an array of article IDs.
- `firstSeen` and `lastSeen` should be Unix timestamps in seconds.
- Deduplication precision affects architecture scoring; avoid false merges.

FR-7 Relationship graph:
- Nodes:
  - Article nodes: id, kind article, label/title, timestamp in Unix seconds, importance.
  - Entity nodes: id, kind entity, label, entityType.
- Edges:
  - mentions: article to entity.
  - co_mention: entity to entity, with integer weight count.
  - similar: article to article, optional, with score from 0 to 1 if implemented.
- Mandatory graph filters: node type and category.
- Should-level graph filters: time window and text search.
- Rebuild graph action is needed after axis changes/regeneration.

FR-8 Categories and axes:
- Categories are per-user configuration and edited without LLM.
- Axes and values are database records, edited through UI, and used during labelling.
- Seed 4 to 5 example axes but keep them configurable.

FR-9 Regeneration:
- Runs in background via queue.
- Does not block UI.
- Shows progress.
- Reuses cached results when possible.
- Respects LLM concurrency limits.
- Rebuilds graph after updated labelling.

FR-10 Cost control and LLM telemetry:
- Normal article processing should use no more than one LLM provider call per article.
- Cache by content hash.
- Bound concurrent LLM calls with env, for example `LLM_CONCURRENCY`.
- Token limits come from env.
- Track calls and tokens by operation type: processing, regeneration, digest.
- Provide aggregate visibility, preferably in UI for Should scope.
- Avoid quadratic LLM flows in deduplication.

FR-11 Period digests:
- Digest job runs through queue.
- Deterministic code selects/counts top entities, top categories, and key articles.
- LLM is used only to write the final overview text.

## Non-Functional Requirements

Performance:
- Test target is up to 10 feeds per user.
- UI remains responsive during workers and regeneration.
- Long operations never run synchronously inside HTTP requests.
- Graph renders and filters smoothly for MVP review data.

Observability:
- Use structured logs, not random context-free prints.
- Log feed pulls, article processing, regeneration, and digest builds with identifiers and outcomes.
- Log errors with diagnostic context.
- Expose queue state through Bull Board.
- Expose LLM telemetry by operation type.

Security:
- Hash passwords with argon2 or bcrypt.
- Use JWT or server sessions.
- Require email confirmation before app access.
- Enforce user isolation at data access level.
- Store all secrets only in env.
- Protect Bull Board with basic auth from env.

Code quality:
- Follow Google TypeScript Style Guide.
- Provide linter config and passing lint command.
- No unused imports, variables, functions, dead files, or "for later" commented blocks.
- No non-printable Unicode characters.
- Every file and module should have a purpose the author can explain.

Testing:
- Meaningful tests are Should-level but important for score.
- Highest-value targets: LLM adapter response parsing/validation/error handling, RSS/Atom parsing, heuristic pre-filter, article deduplication, entity deduplication.
- Avoid tests that only increase coverage without checking behavior.

Git history:
- Development history must show progression with meaningful commits.
- A single final dump commit is a serious penalty and can lead to rejection.
- Do not rewrite history into a single clean state before submission.

Documentation:
- README must include project description, chosen backend/frontend/database, startup guide, env setup, demo data instructions, app and Bull Board URLs, repository structure if needed, ADRs, implemented Should/Could items, and known limitations.
- Documentation should let a reviewer start and understand the project without reading all code.

## Submission And Acceptance

Repository contents expected at root:
- Full source for frontend, backend, workers, shared code.
- `docker-compose.yml` for the full stack.
- `.env.example` with every variable and comments.
- README with startup guide and ADRs.
- Linter configuration.
- Demo data mechanism: seed script, demo feed, or equivalent.

Acceptance gate:
- Reviewer can run the app with docker compose on a clean Docker machine after filling `.env`.
- Frontend becomes reachable.
- Must-level functionality works.
- Acceptance walkthrough passes without blocking failures.
- Claimed Should/Could features must work if present.
- Reviewer has private repository access in time.

Manual acceptance walkthrough:
1. Start the stack with one command and wait for services.
2. Open frontend.
3. Register.
4. Retrieve dev-mode confirmation link from logs or UI and confirm email.
5. Log out.
6. Log in.
7. Add RSS feed and see status.
8. Wait for workers or use demo data.
9. See article feed with summaries, entities, categories, importance, and similar counter.
10. Apply filters: category, feed, importance, period.
11. Open article card and entity card.
12. Open graph, see nodes and typed edges, filter, click node, see detail.
13. Change axes, trigger regeneration, keep using UI while it runs, confirm graph updates.
14. Request period digest if implemented.
15. Open Bull Board, authenticate, and inspect queue state.

UI requirement:
- Minimal, tidy, responsive, no broken layout across screen sizes.

## Scoring

Base score: 100 points.
- Functionality Must: 30
- Architecture: 25
- Code quality: 20
- UI/UX: 15
- README and ADR: 10

Bonuses:
- Up to +10 for strong Should implementation.
- Up to +10 for Could features.

Penalties:
- Up to -30 for defects such as dead code, weak architecture, direct LLM calls from handlers, long synchronous HTTP work, secrets in repo, hard-coded config, missing error handling, unrelated optional work while Must scope is missing, and signs of unreviewed AI generation.

Disqualification or zero-score risks:
- App does not start.
- Acceptance walkthrough has blocking failures.
- Reviewer lacks repository access.
- No meaningful development history.
- Single-commit dump of the whole solution.
- Plagiarism or submitting someone else's work.

## Required README ADR Topics

README must contain at least 5 Architectural Decision Records.

Use this structure:

```md
## ADR-N: <decision title>

Context: the task or problem.
Decision: what was chosen.
Alternatives: what else was considered.
Trade-offs: what was gained, what was given up.
```

Minimum ADR topics:
- Deterministic code vs LLM responsibility split.
- Entity deduplication strategy.
- Cost control and LLM caching.
- LLM provider failure/error-handling strategy.
- Backend choice, NestJS or Directus, with justification.

ADRs must match the real implementation. Generic or detached ADRs will be treated as evidence that the solution is not understood.

## Suggested Agent Workflow For This Repo

Before implementing:
- Re-read this file and the current README.
- Inspect the actual repository structure and package tooling.
- Pick the backend/frontend/database choices intentionally and record why.
- Plan the data model around multi-user isolation, article reuse, labels, axes, graph nodes/edges, queues, LLM cache, and telemetry.
- Keep Must scope first. Do not spend time on Could features before the acceptance gate is covered.

During implementation:
- Keep LLM work behind queue jobs and the LLM abstraction.
- Keep deterministic parsing/filtering/deduplication out of the LLM path.
- Add env variables to `.env.example` as they are introduced.
- Add tests around risky logic as it appears.
- Maintain meaningful commits if asked to commit.

Before claiming completion:
- Run lint and tests.
- Check for non-printable Unicode.
- Start via docker compose or the documented equivalent.
- Walk through the acceptance checklist.
- Verify Bull Board and demo data.
- Confirm README startup instructions and ADRs match the implementation.

# news-intelligence-hub

UA-Skills: News Intelligence Hub

## Apps

- `apps/api`: NestJS backend.
- `apps/web`: Next.js frontend.
- `apps/worker`: BullMQ worker process.
- `packages/shared`: shared TypeScript contracts and constants.
- `packages/database`: Prisma/PostgreSQL schema and database client helper.

## Infrastructure

- `docker-compose.yml`: PostgreSQL and Redis for the host-based development flow.
- `docker-compose.full.yml`: full containerized stack (Postgres, Redis, API, worker, web, and a one-shot migration step).
- `Dockerfile`: single multi-stage image that builds the whole monorepo and runs the API, worker, web, and migration commands.
- `.env.example`: documented environment variables for the app, database, Redis, Bull Board, auth, LLM providers, and feed processing.

## Startup

Both flows read the same `.env` (copy it from the template first):

```bash
cp .env.example .env
# fill in JWT_SECRET, BULL_BOARD_PASSWORD, and an LLM provider key
```

### Full stack (one command)

Builds and runs everything; migrations are applied automatically before the API
and worker start.

```bash
docker compose -f docker-compose.full.yml up --build
```

- Web app: `http://localhost:3000`
- API: `http://localhost:3001`
- Bull Board: `http://localhost:3001/admin/queues`

Stop with `docker compose -f docker-compose.full.yml down` (add `-v` to drop the
database and Redis volumes).

### Development / debug

Runs only Postgres and Redis in Docker; the API, worker, and web run on the host
with hot reload.

```bash
docker compose up -d          # Postgres + Redis
npm install
npm run db:deploy             # apply migrations to the dev database
npm run dev:api               # http://localhost:3001
npm run dev:web               # http://localhost:3000
npm run dev:worker
```

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

## Auth Flow

- Register at `http://localhost:3000/register`.
- In development, the API returns a confirmation link because
  `DEV_EMAIL_CONFIRMATION=true`.
- Confirming email creates the same HttpOnly cookie session used by login.
- Protected API routes derive the current user from the cookie/JWT and no longer
  accept `x-user-id` as an ownership substitute.

See `AGENTS.md` for the full hackathon task brief and implementation requirements.

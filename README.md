# news-intelligence-hub

UA-Skills: News Intelligence Hub

## Apps

- `apps/api`: NestJS backend.
- `apps/web`: Next.js frontend.
- `apps/worker`: BullMQ worker process.
- `packages/shared`: shared TypeScript contracts and constants.
- `packages/database`: Prisma/PostgreSQL schema and database client helper.

## Infrastructure

- `docker-compose.yml`: PostgreSQL and Redis for local development.
- `.env.example`: documented environment variables for the app, database, Redis, Bull Board, auth, LLM providers, and feed processing.

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

See `AGENTS.md` for the full hackathon task brief and implementation requirements.

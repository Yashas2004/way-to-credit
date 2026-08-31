# Way To Credit

Internal loan-status lookup portal. See [CLAUDE.md](./CLAUDE.md) for the full spec, stack, and
non-negotiable invariants.

## From a fresh clone to a running app

```bash
# 1. Use Node 22 (matches .nvmrc)
nvm use

# 2. Install dependencies for every workspace
pnpm install

# 3. Copy the env template and fill in real values
cp .env.example apps/api/.env

# 4. Start local Postgres (port 5433) and Redis (port 6380)
docker compose up -d

# 5. Run the API and web app together
pnpm dev
```

- API: http://localhost:4000 (health check at `/health`, readiness at `/health/ready`)
- Web: http://localhost:5173 (fetches the API's `/health` through the Vite dev proxy at `/api/health`)

## Common commands

```bash
pnpm install              # install all workspaces
pnpm dev                  # run api + web concurrently
pnpm --filter api dev     # api only
pnpm --filter web dev     # web only

docker compose up -d      # local Postgres + Redis

pnpm db:generate          # generate a migration from schema changes
pnpm db:migrate           # apply migrations
pnpm db:seed              # seed dev data
pnpm db:studio            # Drizzle Studio

pnpm typecheck            # tsc --noEmit across workspaces
pnpm lint                 # eslint
pnpm test                 # vitest run
pnpm build                # build all workspaces
```

`pnpm db:*` commands are placeholders until Drizzle ORM and the database schema are added in a
later stage.

## Layout

```
apps/api        Express 5 backend
apps/web        React 18 + Vite frontend
packages/shared Zod schemas and inferred types shared by both apps
```

## Tooling

- Husky + lint-staged run Prettier and ESLint on staged files before each commit.
- Commit messages are enforced as [Conventional Commits](https://www.conventionalcommits.org/).
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, test, and build on every push and PR,
  against real Postgres and Redis service containers.

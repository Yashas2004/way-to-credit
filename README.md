# Way To Credit

Internal loan-status lookup portal. See [CLAUDE.md](./CLAUDE.md) for the full spec, stack, and
non-negotiable invariants.

## From a fresh clone to a running app

```bash
# 1. Use Node 22 (matches .nvmrc)
nvm use

# 2. Install dependencies for every workspace
pnpm install

# 3. Copy the env template and fill in real values — at the repo root, not
#    apps/api/: config/env.ts walks up from wherever it's running to the
#    directory containing pnpm-workspace.yaml and reads .env from there.
cp .env.example .env

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

## Troubleshooting

**`db:migrate`, `db:seed`, or the API connect with the wrong Postgres credentials — even though
the root `.env` is correct and nothing shows up in `findstr`/`grep`.**

`dotenv` never overwrites a variable that's already present in `process.env`. If something set
`DATABASE_URL` (or any other var `.env` also defines) before the process started, `.env`'s value
is silently discarded, not merged or preferred — there's no error, it just quietly loses.

On Windows, with VS Code's Python extension installed, the usual cause is the
`"python.terminal.useEnvFile": true` user setting: it injects a _cached_ snapshot of `.env` into
every integrated terminal it opens, which goes stale the moment you rotate a credential in the
real file. A plain Command Prompt or PowerShell window won't have this problem, which is the
telltale sign — if it works outside VS Code and fails inside it, this is almost certainly why.

Every entry point (`pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`) logs its resolved connection
string at startup with the password masked:

```
[env] DATABASE_URL resolved to: postgres://devuser:***@localhost:5433/way_to_credit
```

and, in development only, a second line if `.env`'s value was overridden by something that was
already set first:

```
[env] WARNING: DATABASE_URL was already set in the environment before .env was loaded, so the
.env file's value was ignored (dotenv never overwrites an existing variable).
  Using (pre-existing environment variable): postgres://postgres:***@localhost:5433/way_to_credit
  Ignored (from C:\...\Way-To-Credit\.env): postgres://devuser:***@localhost:5433/way_to_credit
```

If you see that warning: remove or disable `python.terminal.useEnvFile` in VS Code's settings (or
find whatever else is setting the variable — a shell profile is the other common source), open a
fresh terminal, and confirm with `echo $DATABASE_URL` (bash) or `echo $env:DATABASE_URL`
(PowerShell) that it's unset before running any `pnpm` command.

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

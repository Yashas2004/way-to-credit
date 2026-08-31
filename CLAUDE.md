# CLAUDE.md — Loan Status Information Portal

This file is auto-loaded by Claude Code. Read it before making any change.

---

## What this application is

A secure, role-based internal web application for a financial services company.

- **Admins** curate a knowledge base structured as `Bank → Loan Type → Status → Description`.
- **Users** (created only by an admin — there is no self-registration) look up descriptions
  via three cascading dropdowns.
- Users can raise a **query** against any Bank/Loan/Status combination. An admin approves it,
  which awards the user **1 credit point**.
- Every 5 credit points unlocks a **milestone** on an animated treasure-map roadmap.
  Milestone copy is admin-configurable, never hardcoded.

The data is financial and sensitive. Security and uptime are hard requirements, not nice-to-haves.

---

## Stack (locked — do not substitute)

| Layer                          | Choice                                                   |
| ------------------------------ | -------------------------------------------------------- |
| Language                       | TypeScript, `strict: true`, everywhere                   |
| Package manager                | pnpm workspaces                                          |
| Backend                        | Node 22 LTS + Express 5                                  |
| Database                       | PostgreSQL 16 (managed: Neon or Supabase)                |
| ORM / migrations               | Drizzle ORM + drizzle-kit                                |
| Cache / sessions / rate limits | Redis (Upstash in prod, Docker locally)                  |
| Validation                     | Zod — schemas live in `packages/shared`                  |
| Frontend                       | React 18 + Vite + TypeScript                             |
| Routing                        | React Router                                             |
| Server state                   | TanStack Query                                           |
| Styling                        | Tailwind CSS                                             |
| Animation                      | Framer Motion (treasure map only)                        |
| Testing                        | Vitest + Supertest (API), Vitest + Testing Library (web) |
| Errors                         | Sentry                                                   |
| SMS / OTP                      | MSG91 (Indian DLT-registered sender)                     |

Do not add a dependency without saying why in the commit message. Do not introduce
Redux, Prisma, Next.js, GraphQL, or a WebSocket server.

---

## Repository layout

```
.
├── apps/
│   ├── api/                 # Express backend
│   │   ├── src/
│   │   │   ├── config/      # env parsing (Zod), constants
│   │   │   ├── db/          # drizzle schema, migrations, seed
│   │   │   ├── middleware/   # auth, rbac, timeWindow, rateLimit, errorHandler
│   │   │   ├── modules/      # feature folders: auth, banks, queries, credits...
│   │   │   │   └── <name>/   # <name>.routes.ts | .service.ts | .repo.ts | .test.ts
│   │   │   ├── lib/          # cache, logger, otp, xlsx, time
│   │   │   └── index.ts
│   │   └── drizzle.config.ts
│   └── web/                 # React frontend
│       └── src/
│           ├── components/  # shared presentational components
│           ├── features/    # feature folders mirroring API modules
│           ├── lib/         # api client, hooks, formatting
│           └── routes/
├── packages/
│   └── shared/              # Zod schemas + inferred types, shared constants
├── docker-compose.yml       # local Postgres + Redis only
└── .github/workflows/ci.yml
```

**Rule:** business logic lives in `*.service.ts`. Route handlers only parse input,
call a service, and shape the response. Database access lives in `*.repo.ts`.
Never write SQL or Drizzle queries inside a route handler.

---

## Non-negotiable invariants

These are correctness and security requirements. Violating one is a bug even if tests pass.

### Time and access windows

1. The server runs in **UTC**. Never read `process.env.TZ` or use the machine's local time.
2. IST is computed as a fixed **UTC + 05:30** offset. India observes no DST.
3. Users may only access the app **Mon–Sat, 09:00–18:00 IST**. This is enforced in
   `middleware/timeWindow.ts` on **every authenticated user request** — not by hiding UI,
   and not by a cron job.
4. Admins have unrestricted 24/7 access. The time-window middleware must never apply to them.
5. Access tokens have a **10-minute TTL** so a session opened at 17:55 cannot survive past
   the window via refresh.

### Auth

6. Access token and refresh token both live in **httpOnly, Secure, SameSite=Lax cookies**.
   Tokens are never written to `localStorage`, `sessionStorage`, or any JS-readable place.
7. Passwords are hashed with **argon2id**. Plaintext passwords are never logged, never
   returned in a response, and never stored — including in error messages.
8. Every admin-only route calls `requireRole('admin')` server-side. Hiding a button in the
   UI is not authorization.
9. Login is rate-limited by IP **and** by userId, with exponential backoff lockout,
   backed by Redis (not in-process memory — we run multiple instances).
10. OTPs are 6 digits, single-use, expire in 5 minutes, and are stored **hashed** in Redis.
    Max 3 sends per number per hour.

### Data integrity

11. Approving a query must be **idempotent**. The credit award runs inside a single
    transaction with a guarded update (`WHERE status = 'pending'`), and does nothing if
    zero rows were affected. Approving twice must never grant two points.
12. Milestone unlocks are computed inside that same transaction.
13. Descriptions default to the literal string `"NA"` when not yet filled in.
14. The audit log table is **append-only**. The application's database role has
    `INSERT` and `SELECT` on it, and no `UPDATE` or `DELETE`.
15. Deleting a bank/loan type/status must not silently orphan rows — use explicit
    `ON DELETE CASCADE` or `RESTRICT`, chosen deliberately per foreign key.

### Caching

16. The full Bank/LoanType/Status/Description tree is cached in Redis and served from
    cache on user reads. **Every admin write invalidates the cache in the same request.**
    A stale dropdown is a correctness bug, not a performance detail.
17. If Redis is unavailable, reads fall through to Postgres and log a warning.
    Redis being down must never cause a 500.

### General

18. All request input is validated with a Zod schema from `packages/shared` before use.
19. Credit, query, and activity-log writes must not block the description-lookup response path.
20. Secrets come from `process.env`, parsed and validated at boot by `config/env.ts`.
    The process must **fail to start** if a required secret is missing. Never commit `.env`.

---

## Commands

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
pnpm build                # build all
```

CI runs `typecheck`, `lint`, `test`, and `build`. All four must pass before merge.

---

## Conventions

- **Errors:** throw typed `AppError` subclasses (`NotFoundError`, `ForbiddenError`,
  `ValidationError`, `ConflictError`). A single `errorHandler` middleware maps them to
  status codes. Never `res.status(500).send(err.message)` — that leaks internals.
- **Responses:** success returns the resource directly. Errors return
  `{ error: { code: string, message: string } }`. `code` is a stable machine-readable
  string the frontend can switch on; `message` is human-readable and safe to display.
- **Logging:** `pino`, structured JSON, with a request ID on every line. Never log
  passwords, tokens, OTPs, or full cookie headers.
- **Naming:** database columns are `snake_case`; TypeScript is `camelCase`. Drizzle handles
  the mapping. API JSON is `camelCase`.
- **IDs:** UUID v7 primary keys (time-sortable, no enumeration leak from sequential ints).
- **Timestamps:** always `timestamptz`, always stored UTC.
- **Money/points:** `creditPoints` is an integer. There are no fractional credits.

---

## Testing expectations

- Every service function with branching logic gets a unit test.
- Every route gets at least one Supertest integration test covering the happy path,
  an unauthorized attempt, and one validation failure.
- These specifically **must** have tests — they are the ones that will bite in production:
  - time-window middleware at the boundaries (Sat 17:59 IST, Sat 18:01 IST, Sunday, Mon 08:59)
  - double-approval of a query awards exactly one credit
  - a user cannot reach any admin route
  - cache invalidation after an admin write
- Tests run against a real Postgres from `docker-compose`, not mocks. Reset with a
  transaction rollback or truncation between tests.

---

## Working style for Claude Code

- **Do one stage at a time.** Do not scaffold future features "while you're in there."
- Before editing more than three files, state the plan and the file list first.
- After each stage, run `pnpm typecheck && pnpm lint && pnpm test` and fix what breaks.
- If the spec is ambiguous, **ask** rather than inventing a behavior. Guessing on a
  security or access-control rule is worse than pausing.
- Prefer boring, obvious code. This is a system a company depends on, not a showcase.
- Never write a migration that drops a column or table without flagging it explicitly.

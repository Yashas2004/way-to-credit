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
11. The frontend and API must be served from the **same registrable domain** in production
    (e.g. `app.example.com` and `api.example.com`) so `SameSite=Lax` cookies are sent.
    Deploying them cross-site — including to two different `*.vercel.app` / `*.onrender.com`
    subdomains, which are on the Public Suffix List — will silently break authentication,
    and local development will not catch it because the Vite dev proxy makes both same-origin.

### Data integrity

12. Approving a query must be **idempotent**. The credit award runs inside a single
    transaction with a guarded update (`WHERE status = 'pending'`), and does nothing if
    zero rows were affected. Approving twice must never grant two points.
13. Milestone unlocks are computed inside that same transaction.
14. Descriptions default to the literal string `"NA"` when not yet filled in.
15. The audit log table is **append-only**. The application's database role has
    `INSERT` and `SELECT` on it, and no `UPDATE` or `DELETE`. Since migration 0006 the
    database also enforces it with a trigger (see **Append-only tables** below), so it
    holds, and is tested, even for owners and superusers.
16. Deleting a bank/loan type/status must not silently orphan rows — use explicit
    `ON DELETE CASCADE` or `RESTRICT`, chosen deliberately per foreign key.
17. `ON DELETE RESTRICT` protects only against hard SQL `DELETE`. Soft delete is an
    `UPDATE` and triggers no FK action — so an admin soft-deleting a bank, loan type,
    or status that still has live `descriptions` rows must be blocked by an explicit
    application-level check in the service layer. This guard is owed as of Stage 3.
18. Any code path that takes a `SELECT ... FOR UPDATE` row lock must set
    `SET LOCAL lock_timeout = '3s'` as the first statement in that transaction, and map
    the resulting Postgres lock-timeout error to a `409 RESOURCE_BUSY` response. A stuck
    lock holder must time out and free its pool connection, never block a request or hold
    a connection indefinitely.

### Append-only tables: `forbid_change()`

`forbid_change()` (migration `0006_issue_immutability.sql`) is a trigger function that
rejects a change with `ERRCODE restrict_violation` (SQLSTATE `23001`) and the message
`<table> is append-only: <OP> is not allowed`. It's attached to:

| Table            | Blocked                  | Why                                                                              |
| ---------------- | ------------------------ | -------------------------------------------------------------------------------- |
| `audit_log`      | UPDATE, DELETE, TRUNCATE | invariant 15                                                                     |
| `issue_messages` | UPDATE, DELETE, TRUNCATE | a sent help-request message is part of the record; a correction is a new message |
| `issues`         | DELETE, TRUNCATE         | help requests change status but never disappear                                  |

- **Hit a `restrict_violation` / "is append-only" error in a test?** That's this trigger.
  The test is trying to clean up or modify rows that must never change. Don't delete audit
  rows; scope assertions to rows the test created. To delete test users' help requests, use
  `purgeTestIssues()` from `lib/testAuth.ts` (`deleteTestUser` already calls it). It's the
  only bypass: `SET LOCAL session_replication_role = replica`, which needs superuser, so it
  works in dev/CI and never for the production app role.
- **Adding a new append-only table?** Attach this function in a custom migration
  (`pnpm --filter api exec drizzle-kit generate --custom`). Don't write a second one:
  `BEFORE UPDATE OR DELETE … FOR EACH ROW` and `BEFORE TRUNCATE … FOR EACH STATEMENT`,
  both `EXECUTE FUNCTION forbid_change()`. Add the table to the test in
  `src/db/immutability.test.ts` and to the grants checklist.

### Caching

19. The Workspace's navigation data — banks, loan types, statuses, and which loan types each
    bank offers — is cached in Redis and served from cache on user reads, each list shipped
    **once** (statuses are global and are never repeated per bank or loan type). **Every
    admin write invalidates the cache in the same request.** A stale dropdown is a
    correctness bug, not a performance detail. Descriptions are not cached: each lookup is
    one indexed read of a single (bank, loan type, status) from Postgres, which also
    re-checks that the bank, loan type and status are live and the pair is attached, so a
    description is never served stale or for a withdrawn combination.
20. If Redis is unavailable, reads fall through to Postgres (the rate limiters to their
    in-process cap) and log a warning. Redis being down, unreachable or stalled must never
    cause a 500, **and must never cause a stall**. A fifteen-second success is an outage
    to the person waiting.
    - Every Redis call answers or fails within `REDIS_COMMAND_TIMEOUT_MS` (300 ms), so the
      most Redis can add to a request is 300 ms × its sequential Redis calls. Login makes
      two.
    - `lib/redis.ts` enforces this:
      - no offline queue, so a command issued while disconnected fails at once instead of
        waiting for a reconnect;
      - a command timeout for a server that's connected but not answering;
      - no per-request retries.

      The connection is opened at boot (`connectRedis()`, never awaited) and reconnects in
      the background. `lib/redis.test.ts` pins this behaviour.

    - Don't re-enable the offline queue or drop the timeout: with ioredis's defaults,
      measured with Redis blackholed, a navigation load took 20–22 s and a login 40–43 s.
      With Redis paused, a request hung for as long as the pause lasted (120 s). After the
      fix, the same cases take login 33–156 ms and navigation 7–68 ms, and ~660 ms / ~320 ms
      with Redis paused.

#### Why the whole navigation list ships to the client (and when to revisit)

This was measured, not assumed, with the real code paths (Stage 0 of the Workspace-at-scale
stage). Code: `lib/workspaceNav.ts`, `GET /api/user/navigation`, `GET /api/user/description`.

- **What it replaced.** The old tree repeated every global status under every attached
  bank–loan-type pair, so it grew as banks × loan types per bank × statuses.
  - At 1000 × 5 × 1000 that was 5 million rows. The query was cancelled by the 5 s
    `statement_timeout` (21.6 s and 2.2 GB of heap without it), the value couldn't be
    cached (its JSON exceeds V8's maximum string length), and each load was 474 MB.
  - Even at realistic scale (50 banks, 20 loan types each, 40 statuses) it was 3.8 MB per
    load, a 10.4 MB cache value, and ~0.5 s of server CPU per Workspace load.
- **What ships now** (the once-each shape):

  | Scale                                             | Raw     | Gzipped                                             |
  | ------------------------------------------------- | ------- | --------------------------------------------------- |
  | Realistic: 50 banks × 20 loan types × 40 statuses | 12.5 KB | **~5 KB** (4.2 KB measured on the shipped endpoint) |
  | 1000 banks, 5 loan types each                     | 262 KB  | 90 KB                                               |
  | 1000 banks, 20 loan types each                    | 319 KB  | 117 KB                                              |
  | **1000 × 1000 × 1000 at 100 loan types per bank** | 623 KB  | **249 KB**                                          |
  - The client parses it in under 5 ms at every size.
  - Realistic time to interactive went from 1.4 s cold / ~0.75 s warm to **~0.16 s**.
  - One description lookup takes 0.7–1.1 ms at every measured size.

- **Why lazy per-level loading was rejected** (search endpoints per bank and per loan type,
  a request per keystroke): it adds endpoints, loading states and per-keystroke traffic to
  save at most ~250 KB gzipped at a ceiling far beyond what this company will run. The
  realistic case is 50× smaller than that.
- **When to revisit.** Size grows with the number of attached bank–loan-type _pairs_,
  not with banks or statuses alone.
  - Lazy loading starts to earn its place at roughly **1 million attached pairs** (every
    one of 1000 banks offering all 1000 loan types). That's an estimated ~5 MB raw and
    **~2 MB gzipped**, extrapolated, not measured.
  - **Trigger:** revisit if `GET /api/user/navigation` exceeds **~1 MB gzipped**, or the
    number of `bank_loan_types` rows exceeds **~500k**.
  - Until then, ship it whole.

### General

21. All request input is validated with a Zod schema from `packages/shared` before use.
22. Credit, query, and activity-log writes must not block the description-lookup response path.
23. Secrets come from `process.env`, parsed and validated at boot by `config/env.ts`.
    The process must **fail to start** if a required secret is missing. Never commit `.env`.
24. `FAKE_NOW` (`config/env.ts`) lets a developer fake the clock that
    `middleware/timeWindow.ts` and `auth.service.ts`'s login/refresh evaluate the
    Mon–Sat/9–6 IST user access window against — for local screenshot/manual-testing use
    only, never a substitute for a proper test with an injected clock. It is read
    (`lib/clock.ts`) **only** when `NODE_ENV === "development"`; outside that it does
    nothing, by construction, not by convention. `index.ts` logs a loud warning at boot
    whenever it's active. It must **never** be honoured in production — do not widen the
    `NODE_ENV` check, and do not set `FAKE_NOW` in any deployed environment's config.

### Help requests

25. Help requests (`modules/issues`) are a **permanent record**. Their rules are deliberate
    product decisions, not gaps waiting to be filled:
    - **Messages are immutable.** A sent message, or a resolve/reopen event, is never
      edited or deleted. A correction is a new message. **Requests are never deleted**, only
      their status changes. Both rules are enforced by `forbid_change()` triggers (see
      **Append-only tables** above), not just by the code.
    - **Resolved requests stay resolved indefinitely.** There's no auto-close, "closed"
      state, archiving or expiry after any period. Don't add a cleanup job. Any reply
      reopens a resolved request.
    - **Only users raise requests; admins only respond.** There are no admin-to-admin
      threads. `requireRole("user")` on the create route enforces it, and
      `userStageAccessControl.test.ts` pins it.
    - **A user sees only their own requests.** Every user query is scoped to `raised_by`,
      and another user's request returns the same 404 as a nonexistent one.
    - **Writes to a request serialise** on its row lock (`SELECT … FOR UPDATE` in
      `runLockedTransaction`), and entries are stamped with `clock_timestamp()`, so thread
      order is commit order. `last_activity_at` only moves forward, which is what keeps
      the keyset pages from repeating a row.
    - **Out of scope, deliberately:** attachments, email/SMS notification and real-time
      push. Unread counts ride the 30-second poll.

### Archiving, not deleting

26. Users and milestones are **never deleted**: every reference to them is `ON DELETE
RESTRICT` (queries, credit transactions, sessions, audit rows, unlocks), and those
    records are the history. Tidiness comes from hiding finished things, and the word
    "delete" doesn't appear in the UI for either.
    - **Users: archived ≠ deactivated.** Deactivated (`is_active = false`) means
      "temporarily blocked". Archived (`archived_at` set) means "this person has left".
      - Archiving implies deactivation; the database enforces it with the CHECK
        `users_archived_implies_inactive`. Archiving also revokes the user's sessions in the
        same transaction.
      - Unarchiving leaves the user **deactivated**. Access is restored only by a separate
        reactivation, and reactivating an archived user is refused (409).
      - Archived users are hidden from the Users list by default (`?archived=exclude`), are
        excluded from the dashboard's user counts, and still appear in history pickers
        (query inbox, help inbox, activity), labelled "(archived)".
      - Archive and unarchive are audited.
    - **Milestones: deactivate plus a filter; deliberately no archive state.** Deactivation
      already stops unlocks, removes the milestone from every rewards map, and leaves
      existing unlocks untouched. The admin list hides inactive milestones by default
      (Show: Active / Inactive / All). A second flag nobody could distinguish from
      `is_active` would be worse than none, so don't add one.

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

## Frontend

- **Framer Motion vs. raw SVG `transform`:** Framer Motion manages the `transform`
  attribute on any `motion.*` element that has `animate` or `transition`. A raw
  `transform="..."` attribute on that same element is silently discarded. Put static
  positioning on a plain parent `<g>` and animate a child. This has caused two separate
  rendering bugs in this project.
- **The cyan rule.** Colour tokens are named by role in `apps/web/tailwind.config.js`; never
  hardcode a hex in a component. The brand cyan `brand` (#00A2D0) is 2.59:1 on `canvas` and
  2.97:1 under white text, so it is a **fill that takes `ink` text** (5.52:1): primary
  buttons, active tabs, progress fills. On light surfaces, anything thin (text, links,
  focus rings, 1–2px indicators) uses `brand-ink` (#007494, 4.67:1), never `brand`.
  Bright `brand` is used thin only on `deep` (4.59:1). Status colours are never the brand hue
  and never carry meaning alone.
- **After changing `tailwind.config.js`, restart the dev server, then verify any new token
  in both a freshly started dev server and a production build.** A running dev server can
  keep the old theme. Classes and `theme()` calls that need a new token are then silently
  not generated, and elements render unstyled. This broke the login page once: the
  production build was fine, and only the long-running dev server was wrong. "Verify" means
  reading computed styles on a real screen, checking the token's own value (not merely "not
  none"), not just looking at one build.
- **The design language.**
  - **The login page is the reference, and is excluded from design-system work.** Don't
    tokenise, restyle or refactor it. Changes there are accessibility fixes only, each
    confirmed pixel-identical by screenshot (except the fix's own pixels).
  - **`Button` has two looks, chosen by context:**
    - _classic_, the default: the login and standalone pages. Radius pinned to 4px.
    - _app_: `ButtonStyleProvider` around both shells in `App.tsx`.

    Primary is solid cyan with ink text in both.

  - **Fonts:**
    - UI text is Plus Jakarta Sans, bundled under its own family name, `Jakarta UI`. The
      login loads Google's copy under the real name; sharing it changed the login's
      headings.
    - No bundled 800 weight.
    - IBM Plex Serif for display headings.
  - **The rewards certificate is frozen as designed:** `.certificate-classic` in
    `RewardsPage` restores IBM Plex Sans and the old 4/8px radii. That's the only reason
    `@fontsource/ibm-plex-sans` is still a dependency.
  - **`brand-gradient` is an accent:** today only the admin sidebar's active-item bar. Never
    a primary action, never a large field on a content screen. More than one use and it
    stops being an accent.
- **Derive, don't sync.** Don't copy a prop into state with an effect
  (`useEffect(() => setX(prop), [prop])`). If the prop is rebuilt on every parent render,
  the effect is always pending after a re-render. `Combobox` did this with the chosen
  label: on a loaded machine the pending effect wrote the label back over a keystroke,
  erasing typed text. Compute the value during render instead (see `Combobox`'s `text`).
- **Logo:** use `<Logo>` (`components/Logo.tsx`), never a direct path. All logo and favicon
  files in `public/` are generated by `apps/web/scripts/build-logo.py` from
  `apps/web/brand/`; edit the master there, not the output.

---

## Deployment

- **Migration `0002` locks three tables while it runs.** It changes `queries.raised_at`,
  `activity_log.occurred_at`, and `credit_transactions.created_at` to millisecond precision,
  which rewrites each table and blocks all reads and writes on it for the duration. Fine while
  these tables are small; if they grow substantially before first deploy, apply it in a
  maintenance window.

### Checklist: production database role (do before go-live, verify after every migration)

Invariant 15 (append-only `audit_log`) and the query timeouts are only real if production
uses a dedicated application role. Local dev can't enforce them: `devuser` is a superuser,
and superusers and table **owners** bypass `GRANT`/`REVOKE` entirely. Managed providers'
default roles (`neondb_owner`, Supabase's `postgres`) own every table, so the app must not
connect as them.

- [ ] Two roles: an owner that runs migrations (e.g. `wtc_owner`), and the role the app's
      `DATABASE_URL` uses (e.g. `wtc_app`), which owns nothing and is `NOSUPERUSER
NOBYPASSRLS`.
- [ ] Grants, run as `wtc_owner` after migrations:

  ```sql
  GRANT USAGE ON SCHEMA public TO wtc_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wtc_app;
  -- audit_log is append-only: INSERT and SELECT, nothing else.
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM wtc_app;
  -- Help requests: messages are append-only; requests change status but are never deleted.
  REVOKE UPDATE, DELETE, TRUNCATE ON issue_messages FROM wtc_app;
  REVOKE DELETE, TRUNCATE ON issues FROM wtc_app;
  -- Tables created by future migrations get the same defaults...
  ALTER DEFAULT PRIVILEGES FOR ROLE wtc_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wtc_app;
  -- ...so re-run the REVOKE above whenever a migration recreates audit_log.
  ```

- [ ] Timeouts on the role, run as the provider's admin role (`ALTER ROLE` needs
      `CREATEROLE`, which the owner role shouldn't have). `lib/db.ts` also sets these per
      connection, but behind a transaction-mode pooler a session `SET` isn't guaranteed to
      stick; the role setting always applies. The API logs a warning at boot if
      `statement_timeout` reads as 0.

  ```sql
  ALTER ROLE wtc_app SET statement_timeout = '5s';
  ALTER ROLE wtc_app SET idle_in_transaction_session_timeout = '10s';
  ```

- [ ] Verify, connected **as `wtc_app`**:

  ```sql
  SELECT privilege_type FROM information_schema.role_table_grants
   WHERE grantee = 'wtc_app' AND table_name = 'audit_log';  -- exactly INSERT, SELECT
  SELECT tableowner FROM pg_tables WHERE tablename = 'audit_log';  -- not wtc_app
  SELECT rolsuper FROM pg_roles WHERE rolname = current_user;      -- f
  SHOW statement_timeout;                                          -- 5s
  DELETE FROM audit_log WHERE false;  -- must fail: permission denied
  ```

## Testing expectations

- Every service function with branching logic gets a unit test.
- Every route gets at least one Supertest integration test covering the happy path,
  an unauthorized attempt, and one validation failure.
- These specifically **must** have tests — they are the ones that will bite in production:
  - time-window middleware at the boundaries (Sat 17:59 IST, Sat 18:01 IST, Sunday, Mon 08:59)
  - double-approval of a query awards exactly one credit
  - a user cannot reach any admin route
  - cache invalidation after an admin write
- Tests run against a real Postgres and Redis from `docker-compose`, not mocks, but **never
  the dev data**. Each run gets its own database, the dev database's name plus `_test`
  (`way_to_credit_test`), and its own Redis index (15, or 14 if dev uses 15).
  - `src/testGlobalSetup.ts` drops and recreates the database, applies the real migrations
    (never seeds) and flushes the index. Afterwards it drops the database and flushes the
    index again.
  - `vitest.config.ts` points every worker at them before `config/env.ts` loads.
  - `assertIsolated()` refuses to run unless the database name ends in `_test` and the
    Redis index isn't the dev one.

  So a running `pnpm dev` can't disturb a test run, and a test run can't write into the dev
  database. Before this, ten help-request tests once failed together while the dev API was
  up, and test runs had left thousands of append-only audit and activity rows in the dev
  database. Reset state between tests with a transaction rollback or truncation.

- **A test must create every piece of state it depends on.** Test files share the test
  database and Redis index, and run in whatever order Vitest picks, so a test can pass only because
  another file happened to run first, or because the local dev DB is seeded (CI migrates but
  never seeds). Then it isn't testing what it claims, and it breaks when order or data
  changes. This has happened twice:
  - `descriptionTree.test.ts` relied on seeded statuses, so it passed locally and failed in CI.
  - The cache "write then read" test relied on another file having created the cache version key (then `tree:version`, now `nav:version`).
    That hid a real invalidation bug until the file was run on its own.

  In review, run a new or changed test file **on its own**
  (`pnpm --filter api exec vitest run <file>`). Every run already starts from a freshly
  migrated, unseeded database, like CI's. If a test needs a precondition such as "this
  key is absent" or "no statuses exist", set it explicitly in the test: delete the key, or
  soft-delete inside a rolled-back transaction. Never inherit it.

- **When a test fails unexpectedly, save its full error output before running anything
  again.** Write the whole run to a file (`pnpm test 2>&1 > run.log`), not a filtered
  summary. A re-run that passes destroys the only evidence. The ten help-request failures
  were never diagnosed because only their names were kept.
- **A test that failed once is a bug until proven otherwise.** To reproduce a rare
  failure:
  1. Add `{ repeats: 200 }` to that one test.
  2. Run it with `-t` while `pnpm --filter api exec vitest run` runs alongside for load.
  3. Log the relevant state only in failing repetitions.

  This turned a one-off Workspace failure into 1 in 5, and found a real typing race.
  Remove the `repeats` before committing.

- **Timing:** async waits (`findBy*`/`waitFor`) default to 5 s (web `src/test/setup.ts`) and
  tests to 15 s. Don't tighten those per test. Assert "fails fast" with generous upper bounds,
  since CI runners are often loaded and a test that fails only sometimes gets ignored rather
  than investigated.

---

## Working style for Claude Code

- **Do one stage at a time.** Do not scaffold future features "while you're in there."
- Before editing more than three files, state the plan and the file list first.
- After each stage, run `pnpm typecheck && pnpm lint && pnpm test` and fix what breaks.
- If the spec is ambiguous, **ask** rather than inventing a behavior. Guessing on a
  security or access-control rule is worse than pausing.
- Prefer boring, obvious code. This is a system a company depends on, not a showcase.
- Never write a migration that drops a column or table without flagging it explicitly.

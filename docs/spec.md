Project Brief: Loan Status Information Portal

Purpose of this document: Paste this entire file into your Claude Project's "Project Instructions" / knowledge base. It is written so that Claude can use it as a persistent spec across many chat sessions while you build the app feature-by-feature. Each section is self-contained enough to reference in a single implementation request (e.g. "Build section 5.2 — the query/credit system").

1. One-line description

A secure, role-based web application where Admins (multiple admin accounts supported) curate a structured knowledge base (Bank → Loan Type → Status → Description) and Users (provisioned only by an Admin) look up that information via cascading dropdowns, with a lightweight query/credit gamification loop layered on top.

2. Actors & Access Model
   2.1 Admin
   Multiple admin accounts are supported (not limited to one).
   Full CRUD over Banks, Loan Types, Statuses, and Descriptions.
   Full CRUD over User accounts (create/delete user id + password — admin sets initial credentials, no user self-registration).
   Can reset or change their own password (self-service, separate from resetting a user's password in §4.3).
   Real-time/near-real-time view of active users.
   Access to a login/logout activity log per user.
   Access to a full history log of all queries raised by users (with timestamp + username).
   Can approve/reject a raised query; approval awards the user 1 credit point.
   Can export/download all entered data (see §6).
   Access: 24/7, no time restriction.
   2.2 User
   Cannot self-register. Logs in only with admin-issued credentials.
   Sees a landing/welcome page after login.
   Navigates to a "workspace" page with 3 cascading dropdowns: Bank Name → Loan Type → Status.
   On selecting all three, sees the corresponding description (defaults to "NA" until admin fills it in).
   Can raise a query tied to the currently viewed Bank/Loan/Status combination, with a short text note. This goes to the admin with a timestamp and the user's identity attached.
   Has a credit point balance and an animated treasure-map-style reward roadmap — every 5 accumulated points unlocks a reward milestone (see §5.4 for detail).
   Sees a live clock (IST) at all times while logged in (see §7.3 for behavior).
   Access: restricted to Mon–Sat, 9:00 AM–6:00 PM IST (server-enforced, see §7.3). Outside this window, login is blocked with a clear message; an already-open session should also be invalidated when the window closes.
3. Data Model (conceptual)
   Bank
   └── has many Loan Types (~15 per bank)
   └── has many Statuses (~10 per loan type)
   └── has one Description (text, defaults to "NA")

User
├── userId, hashed password, display name
├── creditPoints (int)
├── createdBy: admin, createdAt
└── active/inactive flag

Session/ActivityLog
├── userId
├── loginAt, logoutAt
└── ip/device (optional, for security auditing)

Query
├── raisedBy (userId)
├── bankId, loanTypeId, statusId (context it was raised from)
├── message (short text)
├── raisedAt (timestamp)
├── status: pending / approved / rejected
└── resolvedAt, resolvedBy (admin)

Reward/Roadmap
├── userId
├── milestone (every 5 points)
└── unlockedAt

Milestone (admin-configurable, one row per level e.g. 5, 10, 15...)
├── levelNumber
├── pointsRequired
├── title (e.g. "Level 1 Completed")
└── message/description shown on unlock

Admin
├── adminId, hashed password, display name
├── mobileNumber (for OTP-based password reset)
└── createdAt

Decision: PostgreSQL. The Bank → Loan Type → Status → Description structure is a fixed, shallow, highly-relational hierarchy — exactly what foreign keys, unique constraints, and joins are built for. It also gives you transactional guarantees when the admin edits data that many users are reading concurrently, and mature tooling for replicas/connection pooling, which matters more here than MERN familiarity given your priority is uptime and low latency over what's fastest for you to write. Use a managed provider (Neon, Supabase, or RDS/Cloud SQL) rather than self-hosting — you get automated backups, point-in-time recovery, and failover without building that yourself.

Practical schema note: since each bank has ~15 loan types × ~10 statuses, that's ~150 description rows per bank — trivial in size. This whole dataset can be cached in memory (see §7.4), so read latency for the dropdown/description lookups will not be a bottleneck regardless of DB choice; Postgres is chosen for correctness and operational maturity, not because Mongo couldn't handle the scale.

4. Admin-Side Feature List
   Dashboard
   Count of active/online users (live or polling-based).
   Quick stats: total users, total banks, pending queries, total credits issued.
   Bank/Loan/Status Management
   Create/edit/delete Bank.
   Create/edit/delete Loan Type under a Bank.
   Create/edit/delete Status under a Loan Type.
   Edit Description text per (Bank, Loan Type, Status) triple — defaults to "NA".
   Changes reflect immediately for all users (no separate publish step needed for v1; consider a "draft vs published" toggle later if you want review-before-go-live).
   User Management
   Create user (userId + password, set by admin).
   Delete/deactivate user.
   Reset a user's password.
   Admin Account Security
   Change own password (requires current password).
   Reset own password via mobile OTP — admin's phone number is registered on their account; a forgot-password flow sends an OTP via SMS to verify identity before allowing a new password to be set.
   Activity Monitoring
   Per-user login/logout timestamp log.
   Currently-active sessions list.
   Query Inbox
   List of raised queries (pending/approved/rejected), filterable by user/date/status.
   Approve → auto-increments that user's credit points by 1.
   Full historical log, searchable.
   Data Export
   Download all Bank/Loan/Status/Description data as an Excel (.xlsx) file. Exclude user credentials/password hashes from the export — scope it strictly to the knowledge-base content.
   Reward Oversight & Milestone Management
   Admin defines the content for each milestone/level (title, message, e.g. "Milestone Achieved — Level 1 Completed") — configurable per 5-point level, not hardcoded.
   Dashboard view of each user's credit total, which levels they've unlocked, and what's coming next.
5. User-Side Feature List
   Landing/Welcome page post-login — simple, branded, greets user by name.
   Workspace page
   3 cascading dropdowns: Bank → Loan Type → Status.
   Description panel updates based on the full selection.
   Raise a Query
   Small form/modal available while viewing a description.
   User types a short note; submission captures timestamp + username + the Bank/Loan/Status context automatically.
   Query goes into the admin's inbox as "pending."
   Credit + Reward Roadmap ("Treasure Map")
   Visible running credit total.
   The roadmap is styled as an animated cartoon treasure map: a winding path/trail divided into levels, with a chest icon at every 5-point milestone.
   As the user's credits increase, a character/marker icon visually progresses along the path toward the next chest.
   On hitting a multiple of 5, the chest at that point "opens" with an unlock animation, revealing admin-defined milestone content — e.g. a message like "Milestone Achieved — Level 1 Completed," plus a preview of what's needed to reach the next level.
   The admin defines what each milestone/level says and unlocks (configurable per level, not hardcoded) — see §4.8.
   Same progress is mirrored on the admin dashboard per-user (§4.8), so the admin can see how far along each user is without needing to open the user's own view.
   Live Clock
   A live IST clock visible on-screen at all times while logged in (see §7.3 for exact behavior and the red-warning rule).
6. Data Export
   Admin-only endpoint/button to download the full dataset (all banks/loan types/statuses/descriptions) as CSV or Excel.
   Should not include user credentials or password hashes in the export — scope it strictly to the knowledge-base content.
7. Non-Functional Requirements
   7.1 Security (data is sensitive — treat this as a hard requirement, not a nice-to-have)
   Passwords: hashed with bcrypt/argon2, never stored or logged in plaintext.
   Admin mobile-OTP reset: use a reputable SMS/OTP provider (e.g. Twilio, MSG91) rather than rolling your own SMS gateway; OTPs should be short-lived (e.g. 5 min), single-use, and rate-limited per number to prevent OTP-flooding/brute-force.
   Auth: JWT (short-lived access token + refresh token) or server-side sessions with httpOnly, secure, SameSite cookies — avoid storing tokens in localStorage if you can help it (XSS exposure).
   Authorization: every admin-only route double-checked server-side (role check), not just hidden in the UI.
   Input validation/sanitization on every form (queries, descriptions, user creation) to prevent injection (NoSQL/SQL injection, stored XSS in description/query text fields).
   Rate limiting + account lockout/backoff on login attempts (brute-force protection).
   HTTPS enforced everywhere; HSTS header.
   Environment secrets (DB creds, JWT secret) in env vars / a secrets manager — never committed to source control.
   Audit logging: login/logout, admin CRUD actions, query approvals — tamper-evident if possible (append-only log table).
   Least-privilege DB user for the app; no direct public DB exposure.
   Regular dependency scanning (npm audit / Dependabot) since this will hold sensitive financial/loan-related data.
   Consider encryption at rest for the database if hosting allows it, and definitely encrypt backups.
   7.2 Availability
   Admin: 24/7 access, no restrictions.
   User: access window Mon–Sat, 9:00 AM–6:00 PM IST. Enforce this server-side in the auth middleware, not just by hiding UI — an already-authenticated session should be force-logged-out or blocked from making further requests once the window closes, and login attempts outside the window should be rejected with a clear "portal available Mon–Sat, 9 AM–6 PM IST" message.
   7.3 Live Clock & Cutoff Warning
   Both admin and user views show a live-updating clock in IST while logged in.
   For the user side specifically: during the last 30 minutes before the 6:00 PM cutoff (i.e. from 5:30 PM IST onward), the clock display turns red as a visual warning that access is about to end. Outside that window it displays in the normal/default color.
   This is a client-side visual cue layered on top of the server-side enforcement in §7.2 — the red clock warns the user, but the actual session cutoff must still be enforced server-side regardless of whether the client-side clock is working correctly.
   Admin's clock does not need the red-warning behavior since admin access is unrestricted, but showing a live clock for admin too keeps the UI consistent and is useful for correlating with activity-log timestamps.
   7.3 Uptime — "must not go down" requirements

Since this is meant for real company use, treat availability as a first-class requirement, not an afterthought:

Managed everything. Managed DB (Neon/Supabase/RDS) + managed hosting (Render/Railway/Vercel) — all of these give you automatic restarts, health checks, and provider-level failover without you building that infrastructure yourself. Self-managed VMs are a bigger uptime risk unless you have dedicated ops capacity.
Stateless backend, horizontally scalable. Keep the API server stateless (session state in the DB/Redis, not in-process) so you can run 2+ instances behind a load balancer. If one instance crashes or redeploys, the other keeps serving — this is the single biggest lever against downtime.
Health checks + auto-restart. Configure your host's health check endpoint (/health) so a crashed instance is detected and restarted automatically within seconds.
Connection pooling. Use PgBouncer or your provider's built-in pooler — Postgres has a hard connection limit, and an app that opens too many raw connections under load is a classic way services go down.
Graceful degradation for non-critical paths. If the query/credit system's DB write fails, it should return a clear error without taking down the login/dropdown-lookup flow — isolate blast radius between subsystems.
Monitoring + alerting from day one. Uptime monitoring (e.g. a simple pinger hitting /health) plus error tracking (Sentry or similar) so you find out about problems before your admin/users do.
Automated DB backups + point-in-time recovery (standard on managed Postgres) — protects against data loss even if it doesn't directly prevent downtime.
Staging environment before production deploys — catch breaking changes before they hit the live app the company depends on.
7.4 Latency — keeping lookups fast
In-memory cache (Redis) for the Bank/LoanType/Status/Description tree. This data changes rarely (only when the admin edits it) and is read constantly (every user dropdown interaction). Cache it on read, invalidate/refresh on admin write — this turns the User side's core interaction into a cache hit instead of a DB round-trip on every dropdown selection.
Indexes on all foreign keys and on (bankId, loanTypeId, statusId) lookups.
CDN for the frontend (Vercel/Netlify/Cloudflare) so static assets and the SPA shell load fast regardless of user location.
Keep the credit/query/activity-log writes off the hot path — they're write-heavy but not latency-sensitive from the user's perspective, so they don't need to block the description-lookup response.
7.5 Hosting stack (final)
Frontend: Vercel or Netlify (CDN-backed, zero-downtime deploys).
Backend: Render or Railway (both support horizontal scaling and health-check-based restarts); a small dedicated VM only if you later need custom cron-precision for the time-window cutoff.
DB: managed Postgres — Neon or Supabase (both have generous free/low tiers and built-in pooling + backups).
Cache: Redis — Upstash (serverless Redis, pairs well with Vercel/Render) for the description-tree cache and session/rate-limit storage. 8. Suggested Build Order (how to sequence your prompts to the Claude Project)
Data model + backend schema (Bank/LoanType/Status/Description, User, ActivityLog, Query).
Auth system (login, JWT/session, password hashing, role-based middleware) — including the Mon–Sat/9–6 restriction middleware for users.
Admin CRUD APIs (banks/loans/statuses/descriptions, user management).
Admin dashboard UI (stats, user management, activity log, query inbox, export).
User-facing APIs (fetch dropdown data, submit query).
User UI (landing page, cascading dropdowns + description panel, raise-query modal).
Credit/reward system (approval → +1 credit, milestone-every-5 logic, roadmap animation).
Security hardening pass (rate limiting, input validation, headers, audit log review).
Deployment + environment config.

Feed these as separate, focused requests to Claude inside the Project rather than asking for the whole app in one shot — you'll get more reviewable, debuggable output that way.

9. Finalized Stack
   Layer Choice Why
   Frontend React, hosted on Vercel/Netlify CDN-backed, fast, zero-downtime deploys
   Backend Node/Express, stateless, on Render/Railway Horizontally scalable, health-check auto-restart
   Database PostgreSQL (managed — Neon/Supabase) Relational integrity for the fixed hierarchy, pooling, backups
   Cache Redis (Upstash) Sub-millisecond reads for the description tree; also used for sessions/rate-limiting
   Auth JWT (short-lived) + httpOnly refresh cookie No token exposure to XSS via localStorage
   Monitoring Sentry (errors) + uptime pinger on /health Catch problems before users report them
10. Still Open

Nothing major — all core decisions are locked in above. Only implementation-level details remain, to be settled as you build each section (e.g. exact copy/wording for milestone unlock messages, which you'll enter as the admin once the feature is live).

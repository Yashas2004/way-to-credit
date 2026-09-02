import { existsSync, readFileSync } from "node:fs";
import dotenv from "dotenv";
import { z } from "zod";
import { maskDatabaseUrl } from "./maskDatabaseUrl.js";
import { resolveEnvPath, resolveModuleDir } from "./repoRoot.js";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // Valid unconditionally in every environment — "msg91" without a key is a
  // runtime failure at provider-construction time (lib/sms/index.ts), not a
  // boot-time Zod error, since console is what's actually live everywhere
  // today (TRAI DLT registration isn't complete yet).
  SMS_PROVIDER: z.enum(["console", "msg91"]).default("console"),
  MSG91_AUTH_KEY: z.string().min(1).optional(),
  // Dev-only escape hatch so a local Playwright run can screenshot the
  // Mon-Sat/9-6 IST user access window from outside it, without touching
  // `isWithinUserAccessWindow` or any other access-control code. Honoured
  // ONLY when NODE_ENV is exactly "development" — see middleware/timeWindow.ts
  // and index.ts's boot-time warning — and never read at all otherwise, so
  // setting it in a production or staging environment has zero effect.
  FAKE_NOW: z.string().datetime().optional(),
});

const isProduction = process.env["NODE_ENV"] === "production";

// In production (Render, etc.) env vars are injected directly into the process
// and there is no .env file on disk — skip file loading entirely.
let envFilePath: string | undefined;
let envFileExists = false;

// Captured before dotenv.config() runs — dotenv never overwrites a variable
// that's already set, so this is the only way to later tell whether the
// .env file's DATABASE_URL was actually applied or silently discarded. Real
// incident: VS Code's `python.terminal.useEnvFile` setting was injecting a
// stale, pre-credential-rename DATABASE_URL into every integrated
// terminal — dotenv's silent no-clobber then made the correct .env value
// simply never take effect, with nothing printed to say so. Took an hour to
// find by elimination; see the warning below and the README's
// troubleshooting section.
let preExistingDatabaseUrl: string | undefined;

if (!isProduction) {
  const moduleDir = resolveModuleDir(import.meta.url);
  envFilePath = resolveEnvPath(moduleDir);
  envFileExists = existsSync(envFilePath);
  preExistingDatabaseUrl = process.env["DATABASE_URL"];

  if (envFileExists) {
    dotenv.config({ path: envFilePath });
  }
}

function describeEnvSource(): string {
  if (isProduction) {
    return "NODE_ENV=production: skipped .env loading, reading from the real process environment.";
  }
  return `Tried to load env file: ${envFilePath ?? "(unresolved)"} (${envFileExists ? "file exists" : "file does not exist"})`;
}

function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error(`Invalid environment configuration:\n${issues}\n${describeEnvSource()}`);
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();

// This module is the *only* place DATABASE_URL is ever resolved — the real
// app (via index.ts), db:seed (via db/client.ts), and db:migrate (via
// drizzle.config.ts importing `env` directly, same as everything else) all
// go through this exact `parseEnv()` call, so there is no second resolver
// left to quietly disagree with this one. Logged unconditionally (not
// routed through lib/logger.ts, which itself imports this module — that
// would be circular) so a future mismatch between what a script connects to
// and what's in .env is a one-line diagnosis, not a process of elimination.
console.log(`[env] DATABASE_URL resolved to: ${maskDatabaseUrl(env.DATABASE_URL)}`);

// dotenv never overwrites a variable that's already present in
// process.env — so if DATABASE_URL was set before dotenv.config() ran, the
// .env file's value (assuming it even defines one) was silently discarded
// in favour of whatever set it first. That silent precedence is exactly
// what turned a one-line fix into an hour of elimination once already —
// only in development, since in production there's no .env file and
// reading straight from the real process environment is correct and
// expected there.
if (env.NODE_ENV === "development" && envFileExists && preExistingDatabaseUrl !== undefined) {
  const fileValues = dotenv.parse(readFileSync(envFilePath ?? "", "utf8"));
  const fileDatabaseUrl = fileValues["DATABASE_URL"];
  if (fileDatabaseUrl !== undefined) {
    console.warn(
      `[env] WARNING: DATABASE_URL was already set in the environment before .env was loaded, so the .env file's value was ignored (dotenv never overwrites an existing variable).\n` +
        `  Using (pre-existing environment variable): ${maskDatabaseUrl(preExistingDatabaseUrl)}\n` +
        `  Ignored (from ${envFilePath ?? "(unresolved)"}): ${maskDatabaseUrl(fileDatabaseUrl)}\n` +
        `  Find and remove whatever is setting DATABASE_URL before this process starts — a shell profile, a real OS environment variable, or (on Windows, with VS Code's Python extension installed) the "python.terminal.useEnvFile" setting injecting a cached .env into every integrated terminal.`,
    );
  }
}

export type Env = typeof env;

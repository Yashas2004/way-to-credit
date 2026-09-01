import { existsSync } from "node:fs";
import dotenv from "dotenv";
import { z } from "zod";
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
});

const isProduction = process.env["NODE_ENV"] === "production";

// In production (Render, etc.) env vars are injected directly into the process
// and there is no .env file on disk — skip file loading entirely.
let envFilePath: string | undefined;
let envFileExists = false;

if (!isProduction) {
  const moduleDir = resolveModuleDir(import.meta.url);
  envFilePath = resolveEnvPath(moduleDir);
  envFileExists = existsSync(envFilePath);

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
export type Env = typeof env;

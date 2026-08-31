import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit loads this file via a standalone require() of its own transpiled
// output, without following relative imports the way tsx/ts-node do — so the
// Windows-safe root-.env resolution from src/config/repoRoot.ts can't be
// imported here. Duplicated (deliberately small) rather than restructured.
function findRepoRoot(startDir: string): string {
  let dir = path.normalize(startDir);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate the repo root walking up from ${startDir}`);
    }
    dir = parent;
  }
}

if (process.env["NODE_ENV"] !== "production") {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(findRepoRoot(moduleDir), ".env");
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});

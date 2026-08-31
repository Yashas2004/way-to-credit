import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { findRepoRoot, resolveEnvPath, resolveModuleDir } from "./repoRoot.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const expectedRepoRoot = path.resolve(thisDir, "../../../..");
const apiDir = path.resolve(thisDir, "../..");

describe("findRepoRoot", () => {
  it("finds the monorepo root that contains pnpm-workspace.yaml", () => {
    const root = findRepoRoot(thisDir);

    expect(root).toBe(expectedRepoRoot);
    expect(existsSync(path.join(root, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("resolves the root .env even when process.cwd() is apps/api", () => {
    const originalCwd = process.cwd();
    process.chdir(apiDir);

    try {
      expect(process.cwd()).toBe(apiDir);
      expect(resolveEnvPath(thisDir)).toBe(path.join(expectedRepoRoot, ".env"));
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("throws when no pnpm-workspace.yaml exists above the given directory", () => {
    const filesystemRoot = path.parse(thisDir).root;

    expect(() => findRepoRoot(filesystemRoot)).toThrow(/Could not locate the repo root/);
  });
});

describe("resolveModuleDir", () => {
  it("round-trips this module's real path through a file:// URL", () => {
    const url = pathToFileURL(path.join(thisDir, "env.ts")).href;

    expect(resolveModuleDir(url)).toBe(thisDir);
  });

  it("never leaves a file: scheme or percent-encoding in the resolved path", () => {
    const url = pathToFileURL(path.join(thisDir, "env.ts")).href;
    const dir = resolveModuleDir(url);

    expect(dir.startsWith("file:")).toBe(false);
    expect(dir).not.toContain("%20");
  });

  // Regression test for the Windows bug this loader must never reintroduce:
  // `new URL(import.meta.url).pathname` on a `file:///C:/...` URL yields
  // `/C:/Users/...` (leading slash, forward slashes, no drive-letter root),
  // which makes every downstream fs.existsSync silently return false.
  // fileURLToPath handles the Windows drive-letter form correctly; this only
  // resolves to a real backslash path when running on Windows itself, so it
  // only runs there.
  it.runIf(process.platform === "win32")(
    "resolves a file:/// URL with a Windows drive letter to a backslash path with no leading slash",
    () => {
      const dir = resolveModuleDir(
        "file:///C:/Users/Example/Way-To-Credit/apps/api/src/config/env.ts",
      );

      expect(dir).toBe("C:\\Users\\Example\\Way-To-Credit\\apps\\api\\src\\config");
      expect(dir.startsWith("/")).toBe(false);
      expect(dir).not.toContain("/");
    },
  );
});

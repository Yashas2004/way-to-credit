import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Converts an `import.meta.url`-style file URL to a native directory path.
 * `fileURLToPath` (not `new URL(...).pathname`) is required here: on Windows,
 * reading `.pathname` off a `file:///C:/...` URL leaves a leading slash and a
 * `file://` scheme artifact (e.g. `/C:/Users/...`), which silently fails every
 * downstream `fs.existsSync` check. `path.normalize` collapses that further
 * into a canonical, OS-native path.
 */
export function resolveModuleDir(moduleUrl: string | URL): string {
  return path.normalize(path.dirname(fileURLToPath(moduleUrl)));
}

export function findRepoRoot(startDir: string): string {
  let dir = path.normalize(startDir);

  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not locate the repo root (no pnpm-workspace.yaml found) walking up from ${startDir}`,
      );
    }
    dir = parent;
  }
}

export function resolveEnvPath(startDir: string): string {
  return path.normalize(path.join(findRepoRoot(startDir), ".env"));
}

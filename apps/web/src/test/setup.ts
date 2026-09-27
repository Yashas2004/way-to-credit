import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// @testing-library/react's automatic afterEach(cleanup) only self-registers
// when the test runner exposes `afterEach` as a global; this project runs
// with `globals: false` (see vitest.config.ts), so without this the DOM
// from one test leaks into the next within the same file.
afterEach(() => {
  cleanup();
});

// findBy*/waitFor give up after 1 s by default. Every async wait in this
// suite (70 of them, none with its own timeout) relied on that, and the
// tightest — KnowledgeBasePage's editable-cell test — needs 70-110 ms on an
// idle machine: an ~9x slowdown on a loaded runner (seen locally, 388 ms ->
// 3.4 s) reaches the limit, and the test fails only sometimes. 5 s leaves
// ~50x headroom; a wait that genuinely never resolves still fails, just later.
configure({ asyncUtilTimeout: 5_000 });

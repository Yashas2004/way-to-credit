import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// @testing-library/react's automatic afterEach(cleanup) only self-registers
// when the test runner exposes `afterEach` as a global; this project runs
// with `globals: false` (see vitest.config.ts), so without this the DOM
// from one test leaks into the next within the same file.
afterEach(() => {
  cleanup();
});

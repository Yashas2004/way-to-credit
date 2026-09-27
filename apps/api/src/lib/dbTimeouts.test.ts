import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { createPool, pool, POOL_ACQUIRE_TIMEOUT_MS } from "./db.js";
import { isDatabaseBusyError } from "./pgErrors.js";
import { createTestAdmin, deleteTestAdmin, loginAs, type TestAdmin } from "./testAuth.js";

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail");
}

describe("database timeouts", () => {
  // The per-connection SET used to run from an on("connect") listener,
  // concurrently with the caller's first query on that connection, which pg
  // deprecates (removed in pg@9). onConnect is awaited first instead.
  it("sets up a new connection without overlapping queries on it", async () => {
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.message);
    process.on("warning", onWarning);
    const fresh = createPool({ max: 1 });
    try {
      const result = await fresh.query<{ statement_timeout: string }>("SHOW statement_timeout");
      expect(result.rows[0]?.statement_timeout).toBe("5s");
      await new Promise((r) => setTimeout(r, 50)); // warnings are emitted on nextTick
      expect(warnings.filter((m) => m.includes("already executing a query"))).toEqual([]);
    } finally {
      process.off("warning", onWarning);
      await fresh.end();
    }
  });

  it("fails the checkout, rather than handing out an unlimited connection, if the setup SET fails", async () => {
    const broken = createPool({
      max: 1,
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- pg-pool awaits onConnect (see db.ts)
      onConnect: async (client) => {
        await client.query("SET statement_timeout = 'not-a-duration'");
      },
    });
    try {
      await expect(broken.query("SELECT 1")).rejects.toThrow();
    } finally {
      await broken.end();
    }
  });

  it("applies statement_timeout and idle_in_transaction_session_timeout to every pool connection", async () => {
    const client = await pool.connect();
    try {
      const st = await client.query<{ statement_timeout: string }>("SHOW statement_timeout");
      const idle = await client.query<{ idle_in_transaction_session_timeout: string }>(
        "SHOW idle_in_transaction_session_timeout",
      );
      expect(st.rows[0]?.statement_timeout).toBe("5s");
      expect(idle.rows[0]?.idle_in_transaction_session_timeout).toBe("10s");
    } finally {
      client.release();
    }
  });

  it("recognises a real statement timeout as 'database busy'", async () => {
    const client = await pool.connect();
    try {
      // Shortened for the test; the pool's own 5 s limit is asserted above.
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '50ms'");
      const error = await captureError(() => client.query("SELECT pg_sleep(1)"));
      expect(isDatabaseBusyError(error)).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("fails a pool checkout fast, and recognisably, when every connection is taken", async () => {
    const tiny: pg.Pool = createPool({ max: 1, connectionTimeoutMillis: 100 });
    const held = await tiny.connect();
    try {
      const started = Date.now();
      const error = await captureError(() => tiny.query("SELECT 1"));
      // A 100 ms timeout firing; the bound only proves it doesn't hang, with
      // room for a loaded runner.
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(isDatabaseBusyError(error)).toBe(true);
    } finally {
      held.release();
      await tiny.end();
    }
  });

  it("does not treat ordinary failures as 'busy'", () => {
    expect(isDatabaseBusyError(new Error("boom"))).toBe(false);
    expect(isDatabaseBusyError(Object.assign(new Error("dup"), { code: "23505" }))).toBe(false);
  });

  it("maps a statement timeout to 503 SERVICE_BUSY with Retry-After, not a 500", () => {
    const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const req = { id: "req-1", log: { warn: vi.fn(), error: vi.fn() } };
    const wrapped = new Error("Failed query", {
      cause: Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      }),
    });

    errorHandler(wrapped, req as never, res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "2");
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "SERVICE_BUSY",
        message: "The service is busy right now. Please try again in a moment.",
      },
    });
    expect(req.log.error).not.toHaveBeenCalled();
  });

  describe("end to end: a saturated pool", () => {
    const app = createApp();
    let admin: TestAdmin;
    let cookie: string;

    beforeAll(async () => {
      admin = await createTestAdmin();
      cookie = await loginAs(app, admin.adminId);
    });

    afterAll(async () => {
      await deleteTestAdmin(admin.id);
    });

    it("answers 503 SERVICE_BUSY within the acquisition timeout instead of hanging", async () => {
      const max = pool.options.max;
      const held = await Promise.all(Array.from({ length: max }, () => pool.connect()));
      try {
        const started = Date.now();
        const res = await request(app).get("/api/admin/users").set("Cookie", cookie);
        const elapsed = Date.now() - started;

        expect(res.status).toBe(503);
        expect(res.headers["retry-after"]).toBe("2");
        expect((res.body as { error: { code: string } }).error.code).toBe("SERVICE_BUSY");
        expect(elapsed).toBeGreaterThanOrEqual(POOL_ACQUIRE_TIMEOUT_MS - 100);
        // Generous upper bound: the point is "fails at the timeout, doesn't
        // hang", and a loaded runner adds request overhead on top.
        expect(elapsed).toBeLessThan(POOL_ACQUIRE_TIMEOUT_MS + 6_000);
      } finally {
        for (const client of held) client.release();
      }
    });
  });
});

import net from "node:net";
import { Redis } from "ioredis";
import { afterEach, describe, expect, it } from "vitest";
import { REDIS_COMMAND_TIMEOUT_MS, REDIS_OPTIONS } from "./redis.js";

// Invariant 20: Redis being down or stalled must fail fast so callers reach
// their fallback in time. These use the app's real client options against
// local stand-ins, so they're deterministic on any machine. Upper bounds are
// generous (CI runners are often loaded); what they guard against is the
// old behaviour, measured at 20 s per command with Redis blackholed and for
// as long as the stall lasted with Redis paused.
const FAST_ENOUGH_MS = 2_000;

const clients: Redis[] = [];
const servers: net.Server[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as net.AddressInfo).port);
    });
  });
}

async function timeRejection(promise: Promise<unknown>): Promise<number> {
  const t0 = performance.now();
  await expect(promise).rejects.toThrow();
  return performance.now() - t0;
}

describe("Redis client fails fast", () => {
  it("a server that accepts the connection and never answers: the command times out", async () => {
    const sockets: net.Socket[] = [];
    const silent = net.createServer((socket) => sockets.push(socket)); // read nothing, reply nothing
    servers.push(silent);
    const port = await listen(silent);
    // No ready check: the stand-in would never answer INFO, and the point is
    // a connection that's up but stalled.
    const client = new Redis(port, "127.0.0.1", { ...REDIS_OPTIONS, enableReadyCheck: false });
    client.on("error", () => undefined);
    clients.push(client);
    await client.connect();

    const ms = await timeRejection(client.get("anything"));
    expect(ms).toBeGreaterThanOrEqual(REDIS_COMMAND_TIMEOUT_MS - 50);
    expect(ms).toBeLessThan(FAST_ENOUGH_MS);
    for (const s of sockets) s.destroy();
  });

  it("nothing listening: the command is refused at once instead of queued for a reconnect", async () => {
    const probe = net.createServer();
    const port = await listen(probe);
    await new Promise((r) => probe.close(r)); // the port is now free: connections are refused
    const client = new Redis(port, "127.0.0.1", REDIS_OPTIONS);
    client.on("error", () => undefined);
    clients.push(client);
    await client.connect().catch(() => undefined);

    for (let i = 0; i < 3; i++) {
      expect(await timeRejection(client.get("anything"))).toBeLessThan(FAST_ENOUGH_MS);
    }
    // Rejected without queuing. The old client queued the command and gave up
    // only after its retries, each waiting out a reconnect backoff that grew
    // with every attempt (0.4 s -> 2.7 s per request, measured).
    await expect(client.get("anything")).rejects.toThrow(/enableOfflineQueue/);
  });
});

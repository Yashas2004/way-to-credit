import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { db } from "./db/client.js";
import { banks } from "./db/schema/index.js";
import { createTestAdmin, deleteTestAdmin, loginAs, type TestAdmin } from "./lib/testAuth.js";

describe("response compression", () => {
  const app = createApp();
  let admin: TestAdmin;
  let cookie: string;
  const bankIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestAdmin();
    cookie = await loginAs(app, admin.adminId);
    // CI never seeds: make sure the list is comfortably over the 1 KB threshold.
    const rows = await db
      .insert(banks)
      .values(Array.from({ length: 15 }, () => ({ name: `Compression Test Bank ${randomUUID()}` })))
      .returning({ id: banks.id });
    bankIds.push(...rows.map((r) => r.id));
  });

  afterAll(async () => {
    await db.delete(banks).where(inArray(banks.id, bankIds));
    await deleteTestAdmin(admin.id);
  });

  it("gzips JSON when the client accepts it, and the body still parses", async () => {
    const res = await request(app)
      .get("/api/admin/banks")
      .set("Cookie", cookie)
      .set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(Array.isArray(res.body)).toBe(true); // supertest decodes it
    expect((res.body as { id: string }[]).some((b) => b.id === bankIds[0])).toBe(true);
  });

  it("sends identity when the client doesn't ask for compression", async () => {
    const res = await request(app)
      .get("/api/admin/banks")
      .set("Cookie", cookie)
      .set("Accept-Encoding", "identity");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("leaves the .xlsx export alone — it's already a zip", async () => {
    const res = await request(app)
      .get("/api/admin/export")
      .set("Cookie", cookie)
      .set("Accept-Encoding", "gzip")
      .buffer(true)
      .parse((r, callback) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe("PK"); // zip magic
  });
});

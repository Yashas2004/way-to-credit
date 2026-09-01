import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
// See the comment in export.routes.ts: exceljs is CJS-only, so only the
// default import carries its real exports under Node's native ESM loader.
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { banks, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import { createTestAdmin, deleteTestAdmin, loginAs, type TestAdmin } from "../../lib/testAuth.js";
import { getExportRows } from "./export.service.js";

const app = createApp();

function fetchBinary(cookie: string) {
  return request(app)
    .get("/api/admin/export")
    .set("Cookie", cookie)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    });
}

describe("export admin API", () => {
  let admin: TestAdmin;
  let cookie: string;
  let bankId: string;
  let loanTypeId: string;
  let statusId: string;

  beforeAll(async () => {
    admin = await createTestAdmin();
    cookie = await loginAs(app, admin.adminId);

    const [bank] = await db
      .insert(banks)
      .values({ name: `Export Bank ${randomUUID()}` })
      .returning();
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `Export Loan Type ${randomUUID()}` })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: `Export Status ${randomUUID()}`, sortOrder: 1 })
      .returning();
    if (!bank || !loanType || !status) throw new Error("fixture insert failed");
    bankId = bank.id;
    loanTypeId = loanType.id;
    statusId = status.id;

    await db.insert(descriptions).values({
      bankId,
      loanTypeId,
      statusId,
      body: "Exportable description text",
      updatedBy: admin.id,
    });
  });

  afterAll(async () => {
    await db.delete(descriptions).where(eq(descriptions.bankId, bankId));
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanTypeId));
    await db.delete(statuses).where(eq(statuses.id, statusId));
    await deleteTestAdmin(admin.id);
  });

  it("streams a valid .xlsx with readable headers, no user/credential data, matching the DB row count", async () => {
    const res = await fetchBinary(cookie);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const buffer = res.body as Buffer;
    const workbook = new ExcelJS.Workbook();
    // exceljs's bundled .d.ts predates the generic `Buffer<T>` shape current
    // @types/node produces — a real Buffer works fine at runtime.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheet = workbook.getWorksheet("Knowledge Base");
    expect(sheet).toBeDefined();
    if (!sheet) return;

    const headerRow = sheet.getRow(1).values as unknown[];
    expect(headerRow.slice(1)).toEqual(["Bank", "Loan Type", "Status", "Description"]);

    const expectedRows = await getExportRows();
    expect(sheet.rowCount - 1).toBe(expectedRows.length); // -1 for the header row

    const found = sheet
      .getRows(2, sheet.rowCount - 1)
      ?.some((row) => row.getCell(4).text === "Exportable description text");
    expect(found).toBe(true);

    const asText = JSON.stringify(sheet.getSheetValues());
    expect(asText).not.toMatch(/passwordHash/i);
    expect(asText).not.toContain("$argon2id$");
    expect(asText).not.toContain(admin.adminId);
  });
});

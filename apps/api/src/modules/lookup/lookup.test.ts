import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import { banks, bankLoanTypes, descriptions, loanTypes, statuses } from "../../db/schema/index.js";
import { invalidateWorkspaceCache } from "../../lib/cache.js";
import {
  createTestAdmin,
  createTestUser,
  deleteTestAdmin,
  deleteTestUser,
  loginAs,
  type TestAdmin,
  type TestUser,
  WITHIN_WINDOW_INSTANT,
} from "../../lib/testAuth.js";
import * as bankLoanTypesService from "../bankLoanTypes/bankLoanTypes.service.js";
import * as banksService from "../banks/banks.service.js";
import * as descriptionsService from "../descriptions/descriptions.service.js";
import * as loanTypesService from "../loanTypes/loanTypes.service.js";
import * as statusesService from "../statuses/statuses.service.js";

interface Nav {
  statuses: { id: string; name: string; sortOrder: number }[];
  loanTypes: { id: string; name: string }[];
  banks: { id: string; name: string; loanTypes: number[] }[];
}

const app = createApp();

describe("user lookup API", () => {
  let admin: TestAdmin;
  let user: TestUser;
  let userCookie: string;

  let bankId: string;
  let loanTypeId: string;
  let describedStatusId: string;
  let undescribedStatusId: string;

  let deletedBankId: string;
  let deletedLoanTypeId: string;
  let deletedStatusId: string;
  let unwiredLoanTypeId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(WITHIN_WINDOW_INSTANT);

    admin = await createTestAdmin();
    user = await createTestUser(admin.id);
    userCookie = await loginAs(app, user.userId);

    const bank = await banksService.createBank(admin.id, `Lookup Test Bank ${randomUUID()}`);
    const loanType = await loanTypesService.createLoanType(
      admin.id,
      `Lookup Test Loan Type ${randomUUID()}`,
    );
    const describedStatus = await statusesService.createStatus(admin.id, {
      name: `Lookup Described Status ${randomUUID()}`,
      sortOrder: 1,
    });
    const undescribedStatus = await statusesService.createStatus(admin.id, {
      name: `Lookup Undescribed Status ${randomUUID()}`,
      sortOrder: 2,
    });

    bankId = bank.id;
    loanTypeId = loanType.id;
    describedStatusId = describedStatus.id;
    undescribedStatusId = undescribedStatus.id;

    await bankLoanTypesService.attachLoanType(admin.id, bankId, loanTypeId);
    await descriptionsService.upsertDescription(admin.id, {
      bankId,
      loanTypeId,
      statusId: describedStatusId,
      body: "Real description text",
    });

    // A never-wired loan type, for the "unwired pair" 404 case.
    const unwiredLoanType = await loanTypesService.createLoanType(
      admin.id,
      `Lookup Unwired Loan Type ${randomUUID()}`,
    );
    unwiredLoanTypeId = unwiredLoanType.id;

    // A soft-deleted bank — independent of the fixtures above.
    const deletedBank = await banksService.createBank(
      admin.id,
      `Lookup Deleted Bank ${randomUUID()}`,
    );
    deletedBankId = deletedBank.id;
    await banksService.softDeleteBank(admin.id, deletedBankId);

    // A loan type wired to our bank, then soft-deleted — exercises "was
    // wired, now withdrawn" rather than "never wired."
    const deletedLoanType = await loanTypesService.createLoanType(
      admin.id,
      `Lookup Deleted Loan Type ${randomUUID()}`,
    );
    deletedLoanTypeId = deletedLoanType.id;
    await bankLoanTypesService.attachLoanType(admin.id, bankId, deletedLoanTypeId);
    await loanTypesService.softDeleteLoanType(admin.id, deletedLoanTypeId);

    // A status that has a real description, then gets soft-deleted itself —
    // the subtle "description row exists, but its status was since deleted" case.
    const deletedStatus = await statusesService.createStatus(admin.id, {
      name: `Lookup Deleted Status ${randomUUID()}`,
      sortOrder: 3,
    });
    deletedStatusId = deletedStatus.id;
    await descriptionsService.upsertDescription(admin.id, {
      bankId,
      loanTypeId,
      statusId: deletedStatusId,
      body: "Should vanish once the status is deleted",
    });
    // The admin-stage guard (HasDependentDescriptionsError) blocks
    // soft-deleting a status with live descriptions, so this state is
    // unreachable via statusesService.softDeleteStatus — it's constructed
    // directly to exercise the defensive fallback in lookup.service.ts
    // (a descriptions row whose status was since deleted). Cache must be
    // invalidated manually since this bypasses the service layer.
    await db
      .update(statuses)
      .set({ deletedAt: new Date() })
      .where(eq(statuses.id, deletedStatusId));
    await invalidateWorkspaceCache();
  });

  afterAll(async () => {
    vi.useRealTimers();

    await db
      .delete(descriptions)
      .where(and(eq(descriptions.bankId, bankId), eq(descriptions.loanTypeId, loanTypeId)));
    await db
      .delete(bankLoanTypes)
      .where(and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, loanTypeId)));
    await db
      .delete(bankLoanTypes)
      .where(
        and(eq(bankLoanTypes.bankId, bankId), eq(bankLoanTypes.loanTypeId, deletedLoanTypeId)),
      );
    await db.delete(banks).where(eq(banks.id, bankId));
    await db.delete(banks).where(eq(banks.id, deletedBankId));
    await db.delete(loanTypes).where(eq(loanTypes.id, loanTypeId));
    await db.delete(loanTypes).where(eq(loanTypes.id, deletedLoanTypeId));
    await db.delete(loanTypes).where(eq(loanTypes.id, unwiredLoanTypeId));
    await db.delete(statuses).where(eq(statuses.id, describedStatusId));
    await db.delete(statuses).where(eq(statuses.id, undescribedStatusId));
    await db.delete(statuses).where(eq(statuses.id, deletedStatusId));
    await deleteTestUser(user.id);
    await deleteTestAdmin(admin.id);
  });

  it("GET /navigation ships each list once: live entries only, statuses never repeated per pair, no body anywhere", async () => {
    const res = await request(app).get("/api/user/navigation").set("Cookie", userCookie);
    expect(res.status).toBe(200);
    const nav = res.body as Nav;

    const navBank = nav.banks.find((b) => b.id === bankId);
    expect(navBank).toBeDefined();
    // The bank's offered loan types are indexes into the one loanTypes list.
    const offered = (navBank?.loanTypes ?? []).map((i) => nav.loanTypes[i]?.id);
    expect(offered).toContain(loanTypeId);

    // Statuses are one global list: every live status once, none per pair.
    expect(nav.statuses.some((s) => s.id === describedStatusId)).toBe(true);
    expect(new Set(nav.statuses.map((s) => s.id)).size).toBe(nav.statuses.length);
    expect(Object.keys(nav).sort()).toEqual(["banks", "loanTypes", "statuses"]);

    // Soft-deleted bank, loan type and status excluded.
    expect(nav.banks.some((b) => b.id === deletedBankId)).toBe(false);
    expect(nav.loanTypes.some((lt) => lt.id === deletedLoanTypeId)).toBe(false);
    expect(offered).not.toContain(deletedLoanTypeId);
    expect(nav.statuses.some((s) => s.id === deletedStatusId)).toBe(false);

    // Never a description body.
    expect(JSON.stringify(nav)).not.toContain("Real description text");
  });

  // Ported from the old tree's regressions: an admin-created bank has no
  // materialised description rows, yet every live status must be reachable
  // for each pair it offers, as NA.
  it("a newly created, newly attached pair answers NA for every live status, with no description rows", async () => {
    const bank = await banksService.createBank(admin.id, `Lookup Fresh Bank ${randomUUID()}`);
    await bankLoanTypesService.attachLoanType(admin.id, bank.id, loanTypeId);
    try {
      const nav = (await request(app).get("/api/user/navigation").set("Cookie", userCookie))
        .body as Nav;
      const offered = nav.banks
        .find((b) => b.id === bank.id)
        ?.loanTypes.map((i) => nav.loanTypes[i]?.id);
      expect(offered).toEqual([loanTypeId]);
      for (const status of nav.statuses.slice(0, 5)) {
        const res = await request(app)
          .get(
            `/api/user/description?bankId=${bank.id}&loanTypeId=${loanTypeId}&statusId=${status.id}`,
          )
          .set("Cookie", userCookie);
        expect(res.status).toBe(200);
        expect((res.body as { body: string }).body).toBe("NA");
      }
    } finally {
      await db.delete(bankLoanTypes).where(eq(bankLoanTypes.bankId, bank.id));
      await db.delete(banks).where(eq(banks.id, bank.id));
    }
  });

  it("a bank with nothing attached is listed, with an empty loan type list (so the UI can say so)", async () => {
    const bank = await banksService.createBank(admin.id, `Lookup Bare Bank ${randomUUID()}`);
    try {
      const nav = (await request(app).get("/api/user/navigation").set("Cookie", userCookie))
        .body as Nav;
      expect(nav.banks.find((b) => b.id === bank.id)?.loanTypes).toEqual([]);
    } finally {
      await db.delete(banks).where(eq(banks.id, bank.id));
    }
  });

  it("GET /description returns the body for a described triple", async () => {
    const res = await request(app)
      .get(
        `/api/user/description?bankId=${bankId}&loanTypeId=${loanTypeId}&statusId=${describedStatusId}`,
      )
      .set("Cookie", userCookie);
    expect(res.status).toBe(200);
    expect((res.body as { body: string }).body).toBe("Real description text");
  });

  it("GET /description returns 'NA' for a valid, wired, undescribed triple", async () => {
    const res = await request(app)
      .get(
        `/api/user/description?bankId=${bankId}&loanTypeId=${loanTypeId}&statusId=${undescribedStatusId}`,
      )
      .set("Cookie", userCookie);
    expect(res.status).toBe(200);
    expect((res.body as { body: string }).body).toBe("NA");
  });

  it("GET /description returns 404 for a soft-deleted bank", async () => {
    const res = await request(app)
      .get(
        `/api/user/description?bankId=${deletedBankId}&loanTypeId=${loanTypeId}&statusId=${describedStatusId}`,
      )
      .set("Cookie", userCookie);
    expect(res.status).toBe(404);
  });

  it("GET /description returns 404 for a soft-deleted loan type", async () => {
    const res = await request(app)
      .get(
        `/api/user/description?bankId=${bankId}&loanTypeId=${deletedLoanTypeId}&statusId=${describedStatusId}`,
      )
      .set("Cookie", userCookie);
    expect(res.status).toBe(404);
  });

  it("GET /description returns 404 for a soft-deleted status", async () => {
    const res = await request(app)
      .get(
        `/api/user/description?bankId=${bankId}&loanTypeId=${loanTypeId}&statusId=${deletedStatusId}`,
      )
      .set("Cookie", userCookie);
    expect(res.status).toBe(404);
  });

  it("GET /description returns 404 for an unwired pair", async () => {
    const res = await request(app)
      .get(
        `/api/user/description?bankId=${bankId}&loanTypeId=${unwiredLoanTypeId}&statusId=${describedStatusId}`,
      )
      .set("Cookie", userCookie);
    expect(res.status).toBe(404);
  });

  it("GET /description returns 400 VALIDATION_ERROR for a malformed query param", async () => {
    const res = await request(app)
      .get(
        `/api/user/description?bankId=not-a-uuid&loanTypeId=${loanTypeId}&statusId=${describedStatusId}`,
      )
      .set("Cookie", userCookie);
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });
});

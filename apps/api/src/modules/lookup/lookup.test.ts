import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../db/client.js";
import {
  auditLog,
  banks,
  bankLoanTypes,
  descriptions,
  loanTypes,
  statuses,
} from "../../db/schema/index.js";
import { invalidateDescriptionTreeCache } from "../../lib/cache.js";
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

interface TreeStatus {
  statusId: string;
  statusName: string;
  sortOrder: number;
}
interface TreeLoanType {
  loanTypeId: string;
  loanTypeName: string;
  statuses: TreeStatus[];
}
interface TreeBank {
  bankId: string;
  bankName: string;
  loanTypes: TreeLoanType[];
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
    await invalidateDescriptionTreeCache();
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
    await db.delete(auditLog).where(eq(auditLog.actorId, admin.id));
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

  it("GET /tree includes wired, non-deleted entries, excludes soft-deleted ones, and never includes a body field", async () => {
    const res = await request(app).get("/api/user/tree").set("Cookie", userCookie);
    expect(res.status).toBe(200);
    const tree = res.body as TreeBank[];

    const treeBank = tree.find((b) => b.bankId === bankId);
    expect(treeBank).toBeDefined();

    const treeLoanType = treeBank?.loanTypes.find((lt) => lt.loanTypeId === loanTypeId);
    expect(treeLoanType).toBeDefined();

    const treeStatus = treeLoanType?.statuses.find((s) => s.statusId === describedStatusId);
    expect(treeStatus).toBeDefined();
    expect(treeStatus).not.toHaveProperty("body");

    // Soft-deleted bank excluded entirely.
    expect(tree.some((b) => b.bankId === deletedBankId)).toBe(false);
    // Soft-deleted loan type excluded from its (still-live) bank.
    expect(treeBank?.loanTypes.some((lt) => lt.loanTypeId === deletedLoanTypeId)).toBe(false);
    // Described-but-since-deleted status excluded.
    expect(treeLoanType?.statuses.some((s) => s.statusId === deletedStatusId)).toBe(false);

    // No status entry anywhere in the payload carries a body field.
    for (const b of tree) {
      for (const lt of b.loanTypes) {
        for (const s of lt.statuses) {
          expect(s).not.toHaveProperty("body");
        }
      }
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

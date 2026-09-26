import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../db/client.js";
import { bankLoanTypes, banks, descriptions, loanTypes, statuses } from "../db/schema/index.js";
import { createTestAdmin, deleteTestAdmin } from "./testAuth.js";
import { buildDescriptionTree } from "./descriptionTree.js";

describe("buildDescriptionTree", () => {
  // Regression: statuses used to be reached *through* descriptions, so an
  // admin-created bank (which, unlike seeded ones, has no materialised NA
  // rows) showed its loan type but no statuses in the user workspace.
  it("lists every active status as NA for a freshly-wired pair with zero description rows", async () => {
    const [bank] = await db
      .insert(banks)
      .values({ name: `Tree Test Bank ${randomUUID()}` })
      .returning();
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `Tree Test Loan Type ${randomUUID()}` })
      .returning();
    if (!bank || !loanType) throw new Error("fixture insert failed");

    await db.insert(bankLoanTypes).values({ bankId: bank.id, loanTypeId: loanType.id });

    try {
      const activeStatuses = await db.select().from(statuses).where(isNull(statuses.deletedAt));
      expect(activeStatuses.length).toBeGreaterThan(0);

      const tree = await buildDescriptionTree(db);
      const treeLoanType = tree
        .find((b) => b.bankId === bank.id)
        ?.loanTypes.find((lt) => lt.loanTypeId === loanType.id);

      expect(treeLoanType).toBeDefined();
      expect(treeLoanType?.statuses.map((s) => s.statusId).sort()).toEqual(
        activeStatuses.map((s) => s.id).sort(),
      );
      expect(treeLoanType?.statuses.every((s) => s.body === "NA")).toBe(true);
    } finally {
      await db
        .delete(bankLoanTypes)
        .where(and(eq(bankLoanTypes.bankId, bank.id), eq(bankLoanTypes.loanTypeId, loanType.id)));
      await db.delete(banks).where(eq(banks.id, bank.id));
      await db.delete(loanTypes).where(eq(loanTypes.id, loanType.id));
    }
  });

  it("uses a real description's body where one exists, NA for the rest", async () => {
    const admin = await createTestAdmin();
    const [bank] = await db
      .insert(banks)
      .values({ name: `Tree Test Bank ${randomUUID()}` })
      .returning();
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name: `Tree Test Loan Type ${randomUUID()}` })
      .returning();
    const [status] = await db
      .insert(statuses)
      .values({ name: `Tree Test Status ${randomUUID()}`, sortOrder: 9999 })
      .returning();
    if (!bank || !loanType || !status) throw new Error("fixture insert failed");

    await db.insert(bankLoanTypes).values({ bankId: bank.id, loanTypeId: loanType.id });
    await db.insert(descriptions).values({
      bankId: bank.id,
      loanTypeId: loanType.id,
      statusId: status.id,
      body: "Real text",
      updatedBy: admin.id,
    });

    try {
      const tree = await buildDescriptionTree(db);
      const statusesForPair =
        tree
          .find((b) => b.bankId === bank.id)
          ?.loanTypes.find((lt) => lt.loanTypeId === loanType.id)?.statuses ?? [];

      expect(statusesForPair.find((s) => s.statusId === status.id)?.body).toBe("Real text");
      expect(
        statusesForPair.filter((s) => s.statusId !== status.id).every((s) => s.body === "NA"),
      ).toBe(true);
    } finally {
      await db.delete(descriptions).where(eq(descriptions.bankId, bank.id));
      await db
        .delete(bankLoanTypes)
        .where(and(eq(bankLoanTypes.bankId, bank.id), eq(bankLoanTypes.loanTypeId, loanType.id)));
      await db.delete(banks).where(eq(banks.id, bank.id));
      await db.delete(loanTypes).where(eq(loanTypes.id, loanType.id));
      await db.delete(statuses).where(eq(statuses.id, status.id));
      await deleteTestAdmin(admin.id);
    }
  });

  it("still lists a bank with no loan types attached, with an empty loan type list", async () => {
    const [bank] = await db
      .insert(banks)
      .values({ name: `Tree Test Bank ${randomUUID()}` })
      .returning();
    if (!bank) throw new Error("fixture insert failed");

    try {
      const tree = await buildDescriptionTree(db);
      expect(tree.find((b) => b.bankId === bank.id)?.loanTypes).toEqual([]);
    } finally {
      await db.delete(banks).where(eq(banks.id, bank.id));
    }
  });
});

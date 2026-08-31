import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { seed } from "./seed.js";
import {
  admins,
  bankLoanTypes,
  banks,
  descriptions,
  loanTypes,
  milestones,
  statuses,
  userMilestones,
  users,
} from "./schema/index.js";
import { withRolledBackTransaction } from "./testTransaction.js";
import type { DbOrTx } from "./types.js";

async function insertTestAdmin(db: DbOrTx) {
  const [admin] = await db
    .insert(admins)
    .values({
      adminId: `test-admin-${randomUUID()}`,
      passwordHash: "test-hash",
      displayName: "Test Admin",
      mobileNumber: "9000000000",
    })
    .returning();

  if (!admin) {
    throw new Error("Failed to insert test admin");
  }
  return admin;
}

async function insertDescriptionFixture(db: DbOrTx) {
  const admin = await insertTestAdmin(db);

  const [bank] = await db
    .insert(banks)
    .values({ name: `Test Bank ${randomUUID()}` })
    .returning();
  const [loanType] = await db
    .insert(loanTypes)
    .values({ name: `Test Loan Type ${randomUUID()}` })
    .returning();
  const [status] = await db
    .insert(statuses)
    .values({ name: `Test Status ${randomUUID()}`, sortOrder: 1 })
    .returning();

  if (!bank || !loanType || !status) {
    throw new Error("Failed to insert description fixture");
  }
  return { admin, bank, loanType, status };
}

async function countRows(db: DbOrTx, table: PgTable): Promise<number> {
  const [row] = await db.select({ value: sql<number>`count(*)`.mapWith(Number) }).from(table);
  return row?.value ?? 0;
}

async function seededTableCounts(db: DbOrTx) {
  return {
    admins: await countRows(db, admins),
    users: await countRows(db, users),
    banks: await countRows(db, banks),
    loanTypes: await countRows(db, loanTypes),
    statuses: await countRows(db, statuses),
    bankLoanTypes: await countRows(db, bankLoanTypes),
    descriptions: await countRows(db, descriptions),
    milestones: await countRows(db, milestones),
  };
}

describe("schema constraints", () => {
  it("enforces the unique constraint on the description (bank, loan type, status) triple", async () => {
    await withRolledBackTransaction(async (tx) => {
      const { admin, bank, loanType, status } = await insertDescriptionFixture(tx);

      await tx.insert(descriptions).values({
        bankId: bank.id,
        loanTypeId: loanType.id,
        statusId: status.id,
        updatedBy: admin.id,
      });

      await expect(
        tx.insert(descriptions).values({
          bankId: bank.id,
          loanTypeId: loanType.id,
          statusId: status.id,
          updatedBy: admin.id,
        }),
      ).rejects.toThrow();
    });
  });

  it("blocks deleting a bank that still has descriptions referencing it (ON DELETE RESTRICT)", async () => {
    await withRolledBackTransaction(async (tx) => {
      const { admin, bank, loanType, status } = await insertDescriptionFixture(tx);

      await tx.insert(descriptions).values({
        bankId: bank.id,
        loanTypeId: loanType.id,
        statusId: status.id,
        updatedBy: admin.id,
      });

      await expect(tx.delete(banks).where(eq(banks.id, bank.id))).rejects.toThrow();
    });
  });

  it("rejects a duplicate (user_id, milestone_id) in user_milestones", async () => {
    await withRolledBackTransaction(async (tx) => {
      const admin = await insertTestAdmin(tx);

      const [user] = await tx
        .insert(users)
        .values({
          userId: `test-user-${randomUUID()}`,
          passwordHash: "test-hash",
          displayName: "Test User",
          createdBy: admin.id,
        })
        .returning();

      // Level/points chosen well outside the seeded 1-6 / 5-30 range to avoid
      // colliding with real seed data already committed in the database.
      const [milestone] = await tx
        .insert(milestones)
        .values({
          levelNumber: 90_000 + Math.floor(Math.random() * 1000),
          pointsRequired: 900_000 + Math.floor(Math.random() * 1000),
          title: "Test Milestone",
          message: "Test",
        })
        .returning();

      if (!user || !milestone) {
        throw new Error("Failed to insert user/milestone fixture");
      }

      await tx.insert(userMilestones).values({ userId: user.id, milestoneId: milestone.id });

      await expect(
        tx.insert(userMilestones).values({ userId: user.id, milestoneId: milestone.id }),
      ).rejects.toThrow();
    });
  });

  it("running the seed twice produces the same row counts", async () => {
    await withRolledBackTransaction(async (tx) => {
      await seed(tx);
      const firstRun = await seededTableCounts(tx);

      await seed(tx);
      const secondRun = await seededTableCounts(tx);

      expect(secondRun).toEqual(firstRun);
    });
  });
});

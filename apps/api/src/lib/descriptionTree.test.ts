import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../db/client.js";
import { bankLoanTypes, banks, loanTypes } from "../db/schema/index.js";
import { buildDescriptionTree } from "./descriptionTree.js";

describe("buildDescriptionTree", () => {
  it("includes a freshly-wired bank+loanType pair with zero descriptions, as an empty status list", async () => {
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
      const tree = await buildDescriptionTree(db);

      const treeBank = tree.find((b) => b.bankId === bank.id);
      expect(treeBank).toBeDefined();

      const treeLoanType = treeBank?.loanTypes.find((lt) => lt.loanTypeId === loanType.id);
      expect(treeLoanType).toBeDefined();
      expect(treeLoanType?.statuses).toEqual([]);
    } finally {
      await db
        .delete(bankLoanTypes)
        .where(and(eq(bankLoanTypes.bankId, bank.id), eq(bankLoanTypes.loanTypeId, loanType.id)));
      await db.delete(banks).where(eq(banks.id, bank.id));
      await db.delete(loanTypes).where(eq(loanTypes.id, loanType.id));
    }
  });
});

import { db } from "../../db/client.js";
import { descriptions } from "../../db/schema/index.js";
import { recordAudit } from "../../lib/audit.js";
import { invalidateDescriptionTreeCache } from "../../lib/cache.js";
import { NotFoundError } from "../../lib/errors.js";
import { runLockedTransaction } from "../../lib/lockedTransaction.js";
import * as banksRepo from "../banks/banks.repo.js";
import * as loanTypesRepo from "../loanTypes/loanTypes.repo.js";
import * as statusesRepo from "../statuses/statuses.repo.js";
import * as descriptionsRepo from "./descriptions.repo.js";

type Description = typeof descriptions.$inferSelect;

const ENTITY_TYPE = "descriptions";

export interface UpsertDescriptionInput {
  bankId: string;
  loanTypeId: string;
  statusId: string;
  body: string;
}

export async function upsertDescription(
  actorId: string,
  input: UpsertDescriptionInput,
): Promise<Description> {
  const result = await runLockedTransaction(async (tx) => {
    // Fixed lock order (banks, loanTypes, statuses, bank_loan_types) so this
    // never deadlocks against the single-lock soft-delete/detach paths —
    // see CLAUDE.md invariant #17/#18 and the "Concurrency" note in the plan.
    const bank = await banksRepo.findBankByIdForUpdate(tx, input.bankId);
    if (!bank || bank.deletedAt) {
      throw new NotFoundError("Bank not found.");
    }
    const loanType = await loanTypesRepo.findLoanTypeByIdForUpdate(tx, input.loanTypeId);
    if (!loanType || loanType.deletedAt) {
      throw new NotFoundError("Loan type not found.");
    }
    const status = await statusesRepo.findStatusByIdForUpdate(tx, input.statusId);
    if (!status || status.deletedAt) {
      throw new NotFoundError("Status not found.");
    }
    await descriptionsRepo.findBankLoanTypePairForUpdate(tx, input.bankId, input.loanTypeId);

    const before = await descriptionsRepo.findDescriptionByTriple(
      tx,
      input.bankId,
      input.loanTypeId,
      input.statusId,
    );

    const after = await descriptionsRepo.upsertDescription(tx, {
      bankId: input.bankId,
      loanTypeId: input.loanTypeId,
      statusId: input.statusId,
      body: input.body,
      updatedBy: actorId,
    });

    await recordAudit(tx, {
      actorId,
      actorType: "admin",
      action: before ? "update" : "create",
      entityType: ENTITY_TYPE,
      entityId: after.id,
      before: before ?? null,
      after,
    });

    return after;
  });

  await invalidateDescriptionTreeCache();
  return result;
}

export interface DescriptionGridRow {
  statusId: string;
  statusName: string;
  sortOrder: number;
  body: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DescriptionGrid {
  wired: boolean;
  rows: DescriptionGridRow[];
}

export async function getDescriptionGrid(
  bankId: string,
  loanTypeId: string,
): Promise<DescriptionGrid> {
  const bank = await banksRepo.findBankById(db, bankId);
  if (!bank) {
    throw new NotFoundError("Bank not found.");
  }
  const loanType = await loanTypesRepo.findLoanTypeById(db, loanTypeId);
  if (!loanType) {
    throw new NotFoundError("Loan type not found.");
  }

  const pair = await descriptionsRepo.findBankLoanTypePair(db, bankId, loanTypeId);
  const grid = await descriptionsRepo.listDescriptionGridForPair(db, bankId, loanTypeId);

  return {
    wired: pair !== undefined,
    rows: grid.map((row) => ({
      statusId: row.statusId,
      statusName: row.statusName,
      sortOrder: row.sortOrder,
      body: row.body ?? "NA",
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      updatedBy: row.updatedBy ?? null,
    })),
  };
}

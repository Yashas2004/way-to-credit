import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { env } from "../config/env.js";
import { hashPassword } from "../lib/password.js";
import {
  admins,
  bankLoanTypes,
  banks,
  descriptions,
  loanTypes,
  milestones,
  statuses,
  users,
} from "./schema/index.js";
import type { DbOrTx } from "./types.js";

const DEV_PASSWORD = "DevPass@123";

const BANK_NAMES = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank"] as const;

const LOAN_TYPE_NAMES = [
  "Home Loan",
  "Personal Loan",
  "Car Loan",
  "Loan Against Property",
  "Gold Loan",
  "Education Loan",
  "Business Loan",
  "Two-Wheeler Loan",
] as const;

const STATUS_NAMES: readonly { name: string; sortOrder: number }[] = [
  { name: "Login", sortOrder: 1 },
  { name: "Document Verification", sortOrder: 2 },
  { name: "Credit Appraisal", sortOrder: 3 },
  { name: "Sanctioned", sortOrder: 4 },
  { name: "Disbursed", sortOrder: 5 },
  { name: "On Hold", sortOrder: 6 },
  { name: "Under Query", sortOrder: 7 },
  { name: "Rejected", sortOrder: 8 },
  { name: "Closed", sortOrder: 9 },
  { name: "Foreclosed", sortOrder: 10 },
];

// Which loan types each bank offers (5-6 each).
const BANK_LOAN_TYPE_WIRING: Record<(typeof BANK_NAMES)[number], readonly string[]> = {
  "HDFC Bank": [
    "Home Loan",
    "Personal Loan",
    "Car Loan",
    "Loan Against Property",
    "Gold Loan",
    "Education Loan",
  ],
  "ICICI Bank": ["Home Loan", "Personal Loan", "Car Loan", "Business Loan", "Two-Wheeler Loan"],
  "State Bank of India": [
    "Home Loan",
    "Personal Loan",
    "Education Loan",
    "Gold Loan",
    "Business Loan",
    "Loan Against Property",
  ],
  "Axis Bank": ["Personal Loan", "Car Loan", "Business Loan", "Two-Wheeler Loan", "Gold Loan"],
};

// A curated subset of realistic description text; everything else defaults to 'NA'.
const DESCRIPTION_TEXT: Record<string, string> = {
  "HDFC Bank|Home Loan|Sanctioned":
    "Your Home Loan has been sanctioned. Disbursement will follow final document verification at the branch.",
  "HDFC Bank|Home Loan|Disbursed":
    "The sanctioned loan amount has been disbursed to the builder/seller account as per the agreement.",
  "HDFC Bank|Personal Loan|Rejected":
    "Application rejected due to insufficient credit score. You may reapply after 3 months.",
  "HDFC Bank|Personal Loan|Credit Appraisal":
    "Your income and credit history are currently under review by our credit team.",
  "HDFC Bank|Car Loan|Sanctioned":
    "Car Loan sanctioned. Please submit the vehicle invoice to proceed to disbursement.",
  "ICICI Bank|Home Loan|Document Verification":
    "Submitted documents are being verified. This typically takes 3-5 business days.",
  "ICICI Bank|Personal Loan|Disbursed": "Funds have been credited to your registered bank account.",
  "ICICI Bank|Business Loan|On Hold":
    "Application placed on hold pending additional collateral documentation.",
  "ICICI Bank|Two-Wheeler Loan|Sanctioned":
    "Two-Wheeler Loan sanctioned. Visit the dealership with your sanction letter to complete purchase.",
  "State Bank of India|Home Loan|Login":
    "Your application has been logged into our system and assigned a reference number.",
  "State Bank of India|Education Loan|Sanctioned":
    "Education Loan sanctioned covering tuition and hostel fees as per the submitted fee structure.",
  "State Bank of India|Gold Loan|Disbursed":
    "Loan amount disbursed. Pledged gold ornaments are held in secure branch custody.",
  "State Bank of India|Business Loan|Credit Appraisal":
    "Your business financials and cash-flow statements are under appraisal.",
  "State Bank of India|Loan Against Property|Under Query":
    "A query has been raised by our legal team regarding the property title documents.",
  "Axis Bank|Personal Loan|Closed":
    "Loan fully repaid and account closed. No further dues outstanding.",
  "Axis Bank|Car Loan|Foreclosed":
    "Loan foreclosed ahead of schedule following full prepayment of the outstanding principal.",
  "Axis Bank|Business Loan|Sanctioned":
    "Business Loan sanctioned subject to execution of the loan agreement and hypothecation deed.",
  "Axis Bank|Two-Wheeler Loan|Rejected":
    "Application rejected due to incomplete KYC documentation. Please reapply with valid address proof.",
  "Axis Bank|Gold Loan|Login":
    "Your gold loan request has been logged. Please visit the branch for gold appraisal.",
  "HDFC Bank|Education Loan|Disbursed":
    "First tranche disbursed directly to the educational institution as per the fee schedule.",
};

const MILESTONES: readonly {
  levelNumber: number;
  pointsRequired: number;
  title: string;
  message: string;
}[] = [
  {
    levelNumber: 1,
    pointsRequired: 5,
    title: "First Steps",
    message:
      "You've earned your first 5 credit points! Keep raising queries to unlock the next milestone.",
  },
  {
    levelNumber: 2,
    pointsRequired: 10,
    title: "Getting the Hang of It",
    message: "10 points banked — you're becoming a regular. 15 points unlocks the next chest.",
  },
  {
    levelNumber: 3,
    pointsRequired: 15,
    title: "Halfway There",
    message: "15 points and climbing. The treasure map has plenty more ahead.",
  },
  {
    levelNumber: 4,
    pointsRequired: 20,
    title: "Seasoned Explorer",
    message: "20 points! Your queries are genuinely improving the knowledge base.",
  },
  {
    levelNumber: 5,
    pointsRequired: 25,
    title: "Trailblazer",
    message: "25 points — you're in rare company. One more chest to go on this leg of the map.",
  },
  {
    levelNumber: 6,
    pointsRequired: 30,
    title: "Treasure Hunter",
    message: "30 points reached — thank you for helping keep the portal accurate.",
  },
];

const USER_ACCOUNTS: readonly { userId: string; displayName: string }[] = [
  { userId: "user1", displayName: "Ramesh Kumar" },
  { userId: "user2", displayName: "Priya Sharma" },
  { userId: "user3", displayName: "Arjun Verma" },
];

async function upsertAdmin(db: DbOrTx, passwordHash: string) {
  const [admin] = await db
    .insert(admins)
    .values({
      adminId: "admin1",
      passwordHash,
      displayName: "Admin User",
      mobileNumber: "9876543210",
    })
    .onConflictDoUpdate({
      target: admins.adminId,
      set: { adminId: sql`excluded.admin_id` },
    })
    .returning();

  if (!admin) {
    throw new Error("Failed to upsert seed admin");
  }
  return admin;
}

async function upsertUsers(db: DbOrTx, createdBy: string, passwordHash: string) {
  const results = [];
  for (const account of USER_ACCOUNTS) {
    const [user] = await db
      .insert(users)
      .values({
        userId: account.userId,
        passwordHash,
        displayName: account.displayName,
        createdBy,
      })
      .onConflictDoUpdate({
        target: users.userId,
        set: { userId: sql`excluded.user_id` },
      })
      .returning();

    if (!user) {
      throw new Error(`Failed to upsert seed user ${account.userId}`);
    }
    results.push(user);
  }
  return results;
}

async function upsertBanks(db: DbOrTx) {
  const results: Record<string, string> = {};
  for (const name of BANK_NAMES) {
    const [bank] = await db
      .insert(banks)
      .values({ name })
      .onConflictDoUpdate({
        target: banks.name,
        targetWhere: sql`${banks.deletedAt} IS NULL`,
        set: { name: sql`excluded.name` },
      })
      .returning();

    if (!bank) {
      throw new Error(`Failed to upsert seed bank ${name}`);
    }
    results[name] = bank.id;
  }
  return results;
}

async function upsertLoanTypes(db: DbOrTx) {
  const results: Record<string, string> = {};
  for (const name of LOAN_TYPE_NAMES) {
    const [loanType] = await db
      .insert(loanTypes)
      .values({ name })
      .onConflictDoUpdate({
        target: loanTypes.name,
        targetWhere: sql`${loanTypes.deletedAt} IS NULL`,
        set: { name: sql`excluded.name` },
      })
      .returning();

    if (!loanType) {
      throw new Error(`Failed to upsert seed loan type ${name}`);
    }
    results[name] = loanType.id;
  }
  return results;
}

async function upsertStatuses(db: DbOrTx) {
  const results: Record<string, string> = {};
  for (const status of STATUS_NAMES) {
    const [row] = await db
      .insert(statuses)
      .values({ name: status.name, sortOrder: status.sortOrder })
      .onConflictDoUpdate({
        target: statuses.name,
        targetWhere: sql`${statuses.deletedAt} IS NULL`,
        set: { sortOrder: status.sortOrder },
      })
      .returning();

    if (!row) {
      throw new Error(`Failed to upsert seed status ${status.name}`);
    }
    results[status.name] = row.id;
  }
  return results;
}

async function wireBankLoanTypes(
  db: DbOrTx,
  bankIds: Record<string, string>,
  loanTypeIds: Record<string, string>,
) {
  for (const bankName of BANK_NAMES) {
    const bankId = bankIds[bankName];
    if (!bankId) continue;

    for (const loanTypeName of BANK_LOAN_TYPE_WIRING[bankName]) {
      const loanTypeId = loanTypeIds[loanTypeName];
      if (!loanTypeId) continue;

      await db
        .insert(bankLoanTypes)
        .values({ bankId, loanTypeId })
        .onConflictDoNothing({ target: [bankLoanTypes.bankId, bankLoanTypes.loanTypeId] });
    }
  }
}

async function seedDescriptions(
  db: DbOrTx,
  bankIds: Record<string, string>,
  loanTypeIds: Record<string, string>,
  statusIds: Record<string, string>,
  updatedBy: string,
) {
  for (const bankName of BANK_NAMES) {
    const bankId = bankIds[bankName];
    if (!bankId) continue;

    for (const loanTypeName of BANK_LOAN_TYPE_WIRING[bankName]) {
      const loanTypeId = loanTypeIds[loanTypeName];
      if (!loanTypeId) continue;

      for (const status of STATUS_NAMES) {
        const statusId = statusIds[status.name];
        if (!statusId) continue;

        const body = DESCRIPTION_TEXT[`${bankName}|${loanTypeName}|${status.name}`] ?? "NA";

        await db
          .insert(descriptions)
          .values({ bankId, loanTypeId, statusId, body, updatedBy })
          .onConflictDoNothing({
            target: [descriptions.bankId, descriptions.loanTypeId, descriptions.statusId],
          });
      }
    }
  }
}

async function upsertMilestones(db: DbOrTx) {
  for (const milestone of MILESTONES) {
    await db
      .insert(milestones)
      .values(milestone)
      .onConflictDoNothing({ target: milestones.levelNumber });
  }
}

export async function seed(db: DbOrTx): Promise<void> {
  const passwordHash = await hashPassword(DEV_PASSWORD);

  const admin = await upsertAdmin(db, passwordHash);
  const seededUsers = await upsertUsers(db, admin.id, passwordHash);
  const bankIds = await upsertBanks(db);
  const loanTypeIds = await upsertLoanTypes(db);
  const statusIds = await upsertStatuses(db);

  await wireBankLoanTypes(db, bankIds, loanTypeIds);
  await seedDescriptions(db, bankIds, loanTypeIds, statusIds, admin.id);
  await upsertMilestones(db);

  if (env.NODE_ENV === "development") {
    console.log("\nSeeded dev credentials (password is shared across all accounts):\n");
    console.log(`  admin: ${admin.adminId} / ${DEV_PASSWORD}`);
    for (const user of seededUsers) {
      console.log(`  user:  ${user.userId} / ${DEV_PASSWORD}`);
    }
    console.log("");
  }
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const { db } = await import("./client.js");

  seed(db)
    .then(() => {
      console.log("Seed complete.");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error("Seed failed:", error);
      process.exit(1);
    });
}

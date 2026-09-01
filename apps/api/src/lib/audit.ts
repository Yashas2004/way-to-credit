import { auditLog } from "../db/schema/index.js";
import type { DbOrTx } from "../db/types.js";

export type AuditAction =
  "create" | "update" | "soft_delete" | "undelete" | "password_reset" | "attach" | "detach";

export interface AuditEntry {
  actorId: string;
  actorType: "admin";
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

// Defense in depth: even if a caller carelessly passes a raw DB row (e.g.
// spreads a `users` row straight into `after`), this strips known-sensitive
// keys before the value ever reaches the append-only audit_log table, which
// is broadly SELECT-able and impossible to edit afterward.
const SENSITIVE_KEYS = new Set(["passwordHash", "password_hash"]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : redact(val);
    }
    return out;
  }
  return value;
}

/** The one place every mutating admin route writes its audit_log row through. */
export async function recordAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    actorType: entry.actorType,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before === undefined ? null : redact(entry.before),
    after: entry.after === undefined ? null : redact(entry.after),
  });
}

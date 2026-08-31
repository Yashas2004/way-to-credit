import type { Db } from "./client.js";

/** Accepts either the real pooled db client or a `db.transaction(...)` callback's tx handle. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

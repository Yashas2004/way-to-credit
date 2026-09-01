import { db } from "../../db/client.js";
import { listExportRows, type ExportRow } from "./export.repo.js";

export async function getExportRows(): Promise<ExportRow[]> {
  return listExportRows(db);
}

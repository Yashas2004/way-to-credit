// exceljs is CJS-only and doesn't expose real ESM named exports — under
// Node's native ESM loader (not Vitest's Vite-transformed module graph,
// which papers over this) `import * as ExcelJS` resolves every named
// property, including `.stream` and `.Workbook`, to `undefined`. Only the
// default import carries the full CJS `module.exports` object.
import ExcelJS from "exceljs";
import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as exportService from "./export.service.js";

export const exportRouter: Router = Router();

exportRouter.use(requireAuth, requireRole("admin"));

// ExcelJS's streaming WorkbookWriter needs to write directly to `res` as
// rows are produced — a narrow, deliberate exception to "route handlers
// only shape the response." Don't move this into the service layer: that
// would mean building the whole workbook before sending any bytes, which
// defeats the point of the streaming writer.
exportRouter.get("/export", async (_req, res, next) => {
  try {
    const rows = await exportService.getExportRows();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="knowledge-base-export.xlsx"');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const sheet = workbook.addWorksheet("Knowledge Base");
    sheet.columns = [
      { header: "Bank", key: "bankName", width: 30 },
      { header: "Loan Type", key: "loanTypeName", width: 30 },
      { header: "Status", key: "statusName", width: 25 },
      { header: "Description", key: "body", width: 60 },
    ];

    for (const row of rows) {
      sheet.addRow(row).commit();
    }

    sheet.commit();
    await workbook.commit();
  } catch (error) {
    next(error);
  }
});

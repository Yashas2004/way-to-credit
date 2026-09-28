import {
  AdminListIssuesQuerySchema,
  MarkIssueReadRequestSchema,
  PostIssueMessageRequestSchema,
  uuidParam,
} from "@way-to-credit/shared";
import { Router, type Request } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as issuesService from "./issues.service.js";

/** The admin help-request inbox. No time window: admins have 24/7 access (CLAUDE.md invariant 4). */
export const issuesAdminRouter: Router = Router();

issuesAdminRouter.use(requireAuth, requireRole("admin"));

function issueId(req: Request): string {
  const parsed = uuidParam.safeParse(req.params["id"]);
  if (!parsed.success) throw new ValidationError("Invalid help request id.");
  return parsed.data;
}

issuesAdminRouter.get("/", async (req, res, next) => {
  try {
    const parsed = AdminListIssuesQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Invalid filters or pagination parameters.");
    res.status(200).json(await issuesService.listForAdmin(requireActorId(req), parsed.data));
  } catch (error) {
    next(error);
  }
});

issuesAdminRouter.get("/unread-count", async (req, res, next) => {
  try {
    res.status(200).json({ count: await issuesService.unreadCountForAdmin(requireActorId(req)) });
  } catch (error) {
    next(error);
  }
});

issuesAdminRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json(await issuesService.getThreadForAdmin(requireActorId(req), issueId(req)));
  } catch (error) {
    next(error);
  }
});

issuesAdminRouter.post("/:id/messages", async (req, res, next) => {
  try {
    const id = issueId(req);
    const parsed = PostIssueMessageRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) throw new ValidationError("A message of 1-5000 characters is required.");
    res
      .status(201)
      .json(await issuesService.replyAsAdmin(requireActorId(req), id, parsed.data.body));
  } catch (error) {
    next(error);
  }
});

issuesAdminRouter.post("/:id/resolve", async (req, res, next) => {
  try {
    res.status(200).json(await issuesService.resolveIssue(requireActorId(req), issueId(req)));
  } catch (error) {
    next(error);
  }
});

issuesAdminRouter.post("/:id/reopen", async (req, res, next) => {
  try {
    res.status(200).json(await issuesService.reopenIssue(requireActorId(req), issueId(req)));
  } catch (error) {
    next(error);
  }
});

issuesAdminRouter.post("/:id/read", async (req, res, next) => {
  try {
    const id = issueId(req);
    const parsed = MarkIssueReadRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) throw new ValidationError("upTo must be an ISO 8601 timestamp.");
    await issuesService.markReadByAdmin(requireActorId(req), id, new Date(parsed.data.upTo));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

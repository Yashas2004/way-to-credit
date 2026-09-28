import {
  CreateIssueRequestSchema,
  ListIssuesQuerySchema,
  MarkIssueReadRequestSchema,
  PostIssueMessageRequestSchema,
  uuidParam,
} from "@way-to-credit/shared";
import { Router, type Request } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { issueCreateRateLimit, issueMessageRateLimit } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { timeWindow } from "../../middleware/timeWindow.js";
import * as issuesService from "./issues.service.js";

/**
 * A user's own help requests. requireRole("user") is also what makes
 * "only users raise requests; admins only respond" true: an admin token
 * gets 403 on every route here, create included.
 */
export const issuesRouter: Router = Router();

issuesRouter.use(requireAuth, timeWindow(), requireRole("user"));

function issueId(req: Request): string {
  const parsed = uuidParam.safeParse(req.params["id"]);
  if (!parsed.success) throw new ValidationError("Invalid help request id.");
  return parsed.data;
}

issuesRouter.get("/", async (req, res, next) => {
  try {
    const parsed = ListIssuesQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError("Invalid pagination parameters.");
    const result = await issuesService.listForUser(
      requireActorId(req),
      parsed.data.limit,
      parsed.data.cursor,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

issuesRouter.get("/unread-count", async (req, res, next) => {
  try {
    res.status(200).json({ count: await issuesService.unreadCountForUser(requireActorId(req)) });
  } catch (error) {
    next(error);
  }
});

// The rate limit runs before validation, so a malformed attempt still counts.
issuesRouter.post("/", issueCreateRateLimit, async (req, res, next) => {
  try {
    const parsed = CreateIssueRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError(
        "A subject (3-150 characters) and a message (1-5000 characters) are required.",
      );
    }
    res.status(201).json(await issuesService.createIssue(requireActorId(req), parsed.data));
  } catch (error) {
    next(error);
  }
});

issuesRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json(await issuesService.getThreadForUser(requireActorId(req), issueId(req)));
  } catch (error) {
    next(error);
  }
});

issuesRouter.post("/:id/messages", issueMessageRateLimit, async (req, res, next) => {
  try {
    const id = issueId(req);
    const parsed = PostIssueMessageRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) throw new ValidationError("A message of 1-5000 characters is required.");
    res
      .status(201)
      .json(await issuesService.replyAsUser(requireActorId(req), id, parsed.data.body));
  } catch (error) {
    next(error);
  }
});

issuesRouter.post("/:id/read", async (req, res, next) => {
  try {
    const id = issueId(req);
    const parsed = MarkIssueReadRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) throw new ValidationError("upTo must be an ISO 8601 timestamp.");
    await issuesService.markReadByUser(requireActorId(req), id, new Date(parsed.data.upTo));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

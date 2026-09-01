import {
  CreateUserRequestSchema,
  ResetUserPasswordRequestSchema,
  uuidParam,
} from "@way-to-credit/shared";
import { Router } from "express";
import { requireActorId } from "../../lib/authContext.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import * as usersService from "./users.service.js";

export const usersRouter: Router = Router();

usersRouter.use(requireAuth, requireRole("admin"));

usersRouter.post("/", async (req, res, next) => {
  try {
    const parsed = CreateUserRequestSchema.safeParse(req.body as unknown);
    if (!parsed.success) {
      throw new ValidationError("userId, displayName, and password are all required.");
    }
    const user = await usersService.createUser(requireActorId(req), parsed.data);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await usersService.listUsers();
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/:id/deactivate", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid user id.");
    }
    const user = await usersService.deactivateUser(requireActorId(req), idResult.data);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/:id/reactivate", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid user id.");
    }
    const user = await usersService.reactivateUser(requireActorId(req), idResult.data);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/:id/reset-password", async (req, res, next) => {
  try {
    const idResult = uuidParam.safeParse(req.params.id);
    if (!idResult.success) {
      throw new ValidationError("Invalid user id.");
    }
    const bodyResult = ResetUserPasswordRequestSchema.safeParse(req.body as unknown);
    if (!bodyResult.success) {
      throw new ValidationError("A valid password is required.");
    }
    await usersService.resetUserPassword(
      requireActorId(req),
      idResult.data,
      bodyResult.data.password,
    );
    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

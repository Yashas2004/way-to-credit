import { z } from "zod";

export const CreateUserRequestSchema = z.object({
  userId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const ResetUserPasswordRequestSchema = z.object({
  password: z.string().min(8).max(200),
});
export type ResetUserPasswordRequest = z.infer<typeof ResetUserPasswordRequestSchema>;

/** Never includes passwordHash. */
export const AdminUserViewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  displayName: z.string(),
  creditPoints: z.number().int(),
  isActive: z.boolean(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
  /** Set when the user has been archived ("has left"); archived implies !isActive. */
  archivedAt: z.string().nullable(),
});
export type AdminUserView = z.infer<typeof AdminUserViewSchema>;

/**
 * Archived users are hidden unless asked for: "exclude" (the Users list's
 * default), "include" (pickers that filter history by user, which must still
 * reach people who have left), or "only".
 */
export const ListUsersQuerySchema = z.object({
  archived: z.enum(["exclude", "include", "only"]).optional().default("exclude"),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

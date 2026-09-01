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
});
export type AdminUserView = z.infer<typeof AdminUserViewSchema>;

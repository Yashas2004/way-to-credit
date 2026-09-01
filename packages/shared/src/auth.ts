import { z } from "zod";

export const LoginRequestSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RoleSchema = z.enum(["admin", "user"]);
export type Role = z.infer<typeof RoleSchema>;

export const AuthIdentitySchema = z.object({
  id: z.string().uuid(),
  role: RoleSchema,
  identifier: z.string(),
  displayName: z.string(),
});
export type AuthIdentity = z.infer<typeof AuthIdentitySchema>;

export const AuthOkResponseSchema = z.object({
  status: z.literal("ok"),
});
export type AuthOkResponse = z.infer<typeof AuthOkResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ForgotPasswordRequestSchema = z.object({
  adminId: z.string().min(1),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  adminId: z.string().min(1),
  otp: z.string().length(6),
  newPassword: z.string().min(8).max(200),
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

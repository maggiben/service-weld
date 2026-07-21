import { z } from "zod";
import { paginated, PaginationQuery } from "./common";
import { RoleCode } from "./enums";

export const AdminUser = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.string().email().nullable(),
  roles: z.array(RoleCode),
  territories: z.array(z.string()),
  territory_ids: z.array(z.number().int()),
  is_active: z.boolean(),
  mfa_enabled: z.boolean(),
  last_login_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  version: z.number().int(),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const AdminUserListQuery = PaginationQuery.extend({
  sort: z.enum(["username", "-username"]).default("username"),
  "filter[role]": RoleCode.optional(),
  "filter[is_active]": z.enum(["true", "false"]).optional(),
  q: z.string().optional(),
});
export type AdminUserListQuery = z.infer<typeof AdminUserListQuery>;

export const AdminUserListResponse = paginated(AdminUser);
export type AdminUserListResponse = z.infer<typeof AdminUserListResponse>;

export const CreateAdminUserInput = z.object({
  username: z.string().trim().min(2).max(64),
  email: z.string().email().nullable().optional(),
  password: z.string().min(8).max(128),
  roles: z.array(RoleCode).min(1),
  territory_ids: z.array(z.number().int()).default([]),
  mfa_enabled: z.boolean().default(false),
});
export type CreateAdminUserInput = z.infer<typeof CreateAdminUserInput>;

export const UpdateAdminUserInput = z
  .object({
    email: z.string().email().nullable().optional(),
    password: z.string().min(8).max(128).optional(),
    roles: z.array(RoleCode).min(1).optional(),
    territory_ids: z.array(z.number().int()).optional(),
    is_active: z.boolean().optional(),
    mfa_enabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.email !== undefined ||
      value.password !== undefined ||
      value.roles !== undefined ||
      value.territory_ids !== undefined ||
      value.is_active !== undefined ||
      value.mfa_enabled !== undefined,
    { message: "At least one field is required" },
  );
export type UpdateAdminUserInput = z.infer<typeof UpdateAdminUserInput>;

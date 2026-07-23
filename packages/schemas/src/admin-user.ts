import { z as zod } from "zod";
import { paginated, PaginationQuery } from "./common";
import { RoleCode } from "./enums";

export const AdminUser = zod.object({
  id: zod.number().int(),
  username: zod.string(),
  email: zod.string().email().nullable(),
  roles: zod.array(RoleCode),
  territories: zod.array(zod.string()),
  territory_ids: zod.array(zod.number().int()),
  is_active: zod.boolean(),
  mfa_enabled: zod.boolean(),
  last_login_at: zod.string().datetime().nullable(),
  created_at: zod.string().datetime(),
  version: zod.number().int(),
});
export type AdminUser = zod.infer<typeof AdminUser>;

export const AdminUserListQuery = PaginationQuery.extend({
  sort: zod.enum(["username", "-username"]).default("username"),
  "filter[role]": RoleCode.optional(),
  "filter[is_active]": zod.enum(["true", "false"]).optional(),
  q: zod.string().optional(),
});
export type AdminUserListQuery = zod.infer<typeof AdminUserListQuery>;

export const AdminUserListResponse = paginated(AdminUser);
export type AdminUserListResponse = zod.infer<typeof AdminUserListResponse>;

export const CreateAdminUserInput = zod.object({
  username: zod.string().trim().min(2).max(64),
  email: zod.string().email().nullable().optional(),
  password: zod.string().min(8).max(128),
  roles: zod.array(RoleCode).min(1),
  territory_ids: zod.array(zod.number().int()).default([]),
  mfa_enabled: zod.boolean().default(false),
});
export type CreateAdminUserInput = zod.infer<typeof CreateAdminUserInput>;

export const UpdateAdminUserInput = zod
  .object({
    email: zod.string().email().nullable().optional(),
    password: zod.string().min(8).max(128).optional(),
    roles: zod.array(RoleCode).min(1).optional(),
    territory_ids: zod.array(zod.number().int()).optional(),
    is_active: zod.boolean().optional(),
    mfa_enabled: zod.boolean().optional(),
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
export type UpdateAdminUserInput = zod.infer<typeof UpdateAdminUserInput>;

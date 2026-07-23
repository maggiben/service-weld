import { z as zod } from "zod";
import { RoleCode } from "@weld/schemas";
import { createZodDto } from "nestjs-zod";

export const LoginRequestSchema = zod.object({
  username: zod.string().min(1),
  password: zod.string().min(1),
  otp: zod.string().optional(),
});
export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}

export const LoginResponseSchema = zod.object({
  access_token: zod.string(),
  refresh_token: zod.string(),
  expires_in: zod.number().int(),
  roles: zod.array(RoleCode),
  territories: zod.array(zod.string()),
});
export class LoginResponseDto extends createZodDto(LoginResponseSchema) {}

export const RefreshRequestSchema = zod.object({
  refresh_token: zod.string().min(1),
});
export class RefreshRequestDto extends createZodDto(RefreshRequestSchema) {}

export const LogoutRequestSchema = zod.object({
  refresh_token: zod.string().min(1),
});
export class LogoutRequestDto extends createZodDto(LogoutRequestSchema) {}

/** Territory scopes with ids — needed by UI forms (create client). */
export const TerritoryScopeSchema = zod.object({
  id: zod.number().int(),
  name: zod.string(),
});

export const MeResponseSchema = zod.object({
  id: zod.number().int(),
  username: zod.string(),
  roles: zod.array(RoleCode),
  /** Territory names (openapi checklist parity). */
  territories: zod.array(zod.string()),
  /** Scoped territories with ids for forms / filtering. */
  territory_scopes: zod.array(TerritoryScopeSchema),
  capabilities: zod.array(zod.string()),
});
export class MeResponseDto extends createZodDto(MeResponseSchema) {}

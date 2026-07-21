import { z } from "zod";
import { RoleCode } from "@weld/schemas";
import { createZodDto } from "nestjs-zod";

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  otp: z.string().optional(),
});
export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int(),
  roles: z.array(RoleCode),
  territories: z.array(z.string()),
});
export class LoginResponseDto extends createZodDto(LoginResponseSchema) {}

export const RefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
});
export class RefreshRequestDto extends createZodDto(RefreshRequestSchema) {}

export const LogoutRequestSchema = z.object({
  refresh_token: z.string().min(1),
});
export class LogoutRequestDto extends createZodDto(LogoutRequestSchema) {}

/** Territory scopes with ids — needed by UI forms (create client). */
export const TerritoryScopeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

export const MeResponseSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  roles: z.array(RoleCode),
  /** Territory names (openapi checklist parity). */
  territories: z.array(z.string()),
  /** Scoped territories with ids for forms / filtering. */
  territory_scopes: z.array(TerritoryScopeSchema),
  capabilities: z.array(z.string()),
});
export class MeResponseDto extends createZodDto(MeResponseSchema) {}

import { SetMetadata } from "@nestjs/common";

export const CAPABILITIES_KEY = "capabilities";

/** Require every listed capability (deny-by-default RBAC, 005 R2). */
export const RequireCapabilities = (...capabilities: string[]) =>
  SetMetadata(CAPABILITIES_KEY, capabilities);

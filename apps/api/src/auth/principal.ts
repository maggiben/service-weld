import type { RoleCode } from "@weld/schemas";

export interface TerritoryRef {
  id: number;
  name: string;
}

/** Authenticated request principal (005 R1). */
export interface AuthPrincipal {
  id: number;
  username: string;
  roles: RoleCode[];
  capabilities: string[];
  territories: TerritoryRef[];
  mfa: boolean;
}

/** Roles that must have ≥1 territory scope row (D-2). */
export const SCOPED_ROLES = new Set<RoleCode>([
  "DRIVER",
  "SUBDIST",
  "CLERK",
  "INVENTORY",
]);

/** Roles with global territory visibility (D-2). */
export const GLOBAL_TERRITORY_ROLES = new Set<RoleCode>([
  "MANAGER",
  "ADMIN",
  "BILLING",
  "MEDICAL",
]);

export function isTerritoryScoped(roles: RoleCode[]): boolean {
  return roles.some((role) => SCOPED_ROLES.has(role));
}

export function hasGlobalTerritoryAccess(roles: RoleCode[]): boolean {
  return roles.some((role) => GLOBAL_TERRITORY_ROLES.has(role));
}

export function territoryIdsForPrincipal(
  principal: AuthPrincipal,
): number[] | null {
  if (hasGlobalTerritoryAccess(principal.roles)) {
    return null;
  }
  if (!isTerritoryScoped(principal.roles)) {
    return null;
  }
  return principal.territories.map((territory) => territory.id);
}

export function isMedicalRole(roles: RoleCode[]): boolean {
  return roles.includes("MEDICAL") || roles.includes("ADMIN");
}

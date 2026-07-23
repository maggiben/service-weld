import type { RoleCode } from "@weld/schemas";
import { territoryMatchKey } from "@weld/schemas";

export type UserDraft = {
  username: string;
  email: string;
  password: string;
  roles: RoleCode[];
  territory_ids: number[];
  mfa_enabled: boolean;
  is_active: boolean;
};

export function emptyUserDraft(): UserDraft {
  return {
    username: "",
    email: "",
    password: "",
    roles: ["CLERK"],
    territory_ids: [],
    mfa_enabled: false,
    is_active: true,
  };
}

export function findExistingTerritory<T extends { name: string }>(
  rawName: string,
  options: T[],
): T | undefined {
  const key = territoryMatchKey(rawName);
  if (!key) return undefined;
  return options.find((tr) => territoryMatchKey(tr.name) === key);
}

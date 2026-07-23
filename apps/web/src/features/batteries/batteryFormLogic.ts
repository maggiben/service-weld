import type { Battery, Cylinder } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";

const STOCK_STATES = new Set(["IN_STOCK_EMPTY", "IN_STOCK_FULL"]);

export type MemberOption = {
  id: number;
  serial_number: string;
  gas_code?: string | null;
  owner_name?: string | null;
  owner_party_id?: number;
};

export function memberLabel(option: MemberOption): string {
  const owner = option.owner_name ? ` · ${option.owner_name}` : "";
  const gas = option.gas_code ? ` · ${option.gas_code}` : "";
  return `${option.serial_number} (#${option.id})${owner}${gas}`;
}

export function chipLabel(option: MemberOption): string {
  return `${option.serial_number} (#${option.id})`;
}

export function fromCylinder(c: Cylinder): MemberOption {
  return {
    id: c.id,
    serial_number: c.serial_number,
    gas_code: c.gas_code,
    owner_name: c.owner_name,
    owner_party_id: c.owner_party_id,
  };
}

export function fromBatteryMembers(battery: Battery): MemberOption[] {
  return (battery.members ?? []).map((m) => ({
    id: m.cylinder_id,
    serial_number: m.serial_number ?? String(m.cylinder_id),
    gas_code: m.gas_code,
    owner_name: battery.owner_name,
    owner_party_id: battery.owner_party_id,
  }));
}

/** Parse freeSolo paste: comma/whitespace-separated positive IDs, deduped. */
export function parseIdTokens(input: string): number[] {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
}

/**
 * Client-side BR-13 soft filter for the member picker.
 * Existing members of `allowBatteryId` stay selectable while editing.
 */
export function isPackableCandidate(
  c: Pick<Cylinder, "packaging" | "battery_id" | "state" | "owner_party_id">,
  ownerPartyId: number | "" | undefined,
  allowBatteryId: number | null,
): boolean {
  if (c.packaging === "BATTERY") return false;
  if (
    c.packaging === "BATTERY_MEMBER" &&
    (allowBatteryId == null || c.battery_id !== allowBatteryId)
  ) {
    return false;
  }
  if (!STOCK_STATES.has(c.state) && c.packaging !== "BATTERY_MEMBER") {
    return false;
  }
  if (ownerPartyId !== "" && ownerPartyId != null) {
    return c.owner_party_id === ownerPartyId;
  }
  return true;
}

export function memberIdDiff(
  prevIds: number[],
  nextIds: number[],
): { toAdd: number[]; toRemove: number[] } {
  const next = new Set(nextIds);
  const prev = new Set(prevIds);
  return {
    toAdd: [...next].filter((id) => !prev.has(id)),
    toRemove: [...prev].filter((id) => !next.has(id)),
  };
}

export function canSaveBatteryForm(params: {
  saving: boolean;
  loadingBattery: boolean;
  code: string;
  ownerId: number | "";
  memberCount: number;
}): boolean {
  return (
    !params.saving &&
    !params.loadingBattery &&
    params.code.trim().length > 0 &&
    params.ownerId !== "" &&
    params.memberCount >= 2
  );
}

export function buildOwnerOptions(
  cylinders: Array<{ owner_party_id: number; owner_name?: string }>,
  editOwner?: { owner_party_id: number; owner_name?: string | null } | null,
): Array<[number, string]> {
  const map = new Map<number, string>();
  for (const cyl of cylinders) {
    if (cyl.owner_name) map.set(cyl.owner_party_id, cyl.owner_name);
  }
  if (editOwner?.owner_name) {
    map.set(editOwner.owner_party_id, editOwner.owner_name);
  }
  return [...map.entries()];
}

export function mergeMemberOptions(
  members: MemberOption[],
  cylinders: Cylinder[],
): MemberOption[] {
  const byId = new Map<number, MemberOption>();
  for (const m of members) byId.set(m.id, m);
  for (const c of cylinders) {
    if (!byId.has(c.id)) byId.set(c.id, fromCylinder(c));
  }
  return [...byId.values()];
}

/** Map API / client errors to user-facing copy (i18n key or raw message). */
export function batteryFormErrorMessage(
  err: unknown,
  t: (key: string) => string,
): string {
  if (err instanceof ApiClientError) {
    if (err.code === "TOO_FEW_MEMBERS") return t("errors.too_few_members");
    if (err.code === "MEMBER_ALREADY_PACKED") {
      return t("errors.member_already_packed");
    }
    return err.message;
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "TOO_FEW_MEMBERS"
  ) {
    return t("errors.too_few_members");
  }
  return t("errors.generic");
}

export type ResolveMemberCallbacks = {
  fetchCylinder: (id: number) => Promise<Cylinder>;
  onNotPackable: (id: number) => void;
  onNotFound: (id: number) => void;
};

/** Resolve Autocomplete freeSolo tokens + selected options into members. */
export async function resolveMemberTokens(
  tokens: Array<string | MemberOption>,
  existing: MemberOption[],
  ownerPartyId: number | "" | undefined,
  allowBatteryId: number | null,
  callbacks: ResolveMemberCallbacks,
): Promise<MemberOption[]> {
  const resolved: MemberOption[] = [];
  const seen = new Set<number>();

  for (const token of tokens) {
    if (typeof token !== "string") {
      if (!seen.has(token.id)) {
        seen.add(token.id);
        resolved.push(token);
      }
      continue;
    }

    const ids = parseIdTokens(token);
    if (ids.length === 0) continue;

    for (const id of ids) {
      if (seen.has(id)) continue;
      const existingMember = existing.find((m) => m.id === id);
      if (existingMember) {
        seen.add(id);
        resolved.push(existingMember);
        continue;
      }
      try {
        const cyl = await callbacks.fetchCylinder(id);
        if (!isPackableCandidate(cyl, ownerPartyId, allowBatteryId)) {
          callbacks.onNotPackable(id);
          continue;
        }
        seen.add(id);
        resolved.push(fromCylinder(cyl));
      } catch {
        callbacks.onNotFound(id);
      }
    }
  }

  return resolved;
}

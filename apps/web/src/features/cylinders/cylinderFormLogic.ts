import type {
  CapacityUnit,
  Cylinder,
  CylinderCondition,
  GasCode,
} from "@weld/schemas";

/** Gases typically sold/stored by weight in this fleet (D-18 / legacy sheets). */
const WEIGHT_GASES = new Set<string>(["ACET", "CO2", "THERMOLENE"]);

export const DEFAULT_DEPOT_NAME = "Chacabuco";
/** Seed id for Chacabuco when the territories list is not loaded yet. */
export const DEFAULT_DEPOT_SEED_ID = 2;

/** Default capacity unit when the user picks a gas on register/edit. */
export function defaultCapacityUnitForGas(
  gas: GasCode | string | null | undefined,
): CapacityUnit {
  if (gas && WEIGHT_GASES.has(gas)) return "KG";
  return "M3";
}

/** Resolve Chacabuco (or fallback seed id) from the live territories list. */
export function resolveDefaultTerritoryId(
  territories: Array<{ id: number; name: string }>,
): number {
  const match = territories.find(
    (item) =>
      item.name.localeCompare(DEFAULT_DEPOT_NAME, "es", {
        sensitivity: "accent",
      }) === 0,
  );
  return match?.id ?? DEFAULT_DEPOT_SEED_ID;
}

export type RegisterCylinderDefaults = {
  owner_party_id: number;
  serial_number: string;
  gas_code: GasCode | null;
  capacity_m3: number | null;
  capacity_unit: CapacityUnit;
  ownership_basis: "OURS" | "SUPPLIER" | "CUSTOMER";
  packaging: "SINGLE";
  home_territory_id: number;
  acquisition_date: null;
  condition: CylinderCondition;
};

/** Fresh register form values — condition EMPTY, depot Chacabuco, no gas. */
export function emptyRegisterCylinderValues(
  homeTerritoryId: number,
): RegisterCylinderDefaults {
  return {
    owner_party_id: 1,
    serial_number: "",
    gas_code: null,
    capacity_m3: null,
    capacity_unit: "M3",
    ownership_basis: "OURS",
    packaging: "SINGLE",
    home_territory_id: homeTerritoryId,
    acquisition_date: null,
    condition: "EMPTY",
  };
}

export function hasSerialNumber(serial: string | null | undefined): boolean {
  return Boolean(serial?.trim());
}

export type RegisterCylinderPrefill = {
  gas_code: GasCode | null;
  capacity_m3: number | null;
  capacity_unit: CapacityUnit;
  condition: CylinderCondition;
  /** Full cylinder: gas/unit come from known contents and should stay locked. */
  lockGas: boolean;
  /** Capacity known on the tank nameplate — keep even when empty. */
  lockCapacity: boolean;
};

/**
 * Prefill register fields from an existing cylinder matched by serial.
 * Full → fill gas + condition. Empty → leave gas free; keep known capacity.
 */
export function prefillRegisterFromCylinder(
  cylinder: Pick<
    Cylinder,
    "condition" | "gas_code" | "capacity_m3" | "capacity_unit" | "state"
  >,
): RegisterCylinderPrefill {
  const isFull =
    cylinder.condition === "FULL" || cylinder.state === "IN_STOCK_FULL";
  const capacityKnown = cylinder.capacity_m3 != null;

  return {
    gas_code: isFull ? (cylinder.gas_code ?? null) : null,
    capacity_m3: cylinder.capacity_m3,
    capacity_unit:
      cylinder.capacity_unit ??
      defaultCapacityUnitForGas(isFull ? cylinder.gas_code : null),
    condition: isFull ? "FULL" : "EMPTY",
    lockGas: isFull && cylinder.gas_code != null,
    lockCapacity: capacityKnown,
  };
}

/** Exact serial match (case-insensitive) from a list search result. */
export function findCylinderBySerial(
  rows: Cylinder[],
  serial: string,
  ownerPartyId?: number,
): Cylinder | null {
  const needle = serial.trim().toLowerCase();
  if (!needle) return null;
  const matches = rows.filter(
    (row) => row.serial_number.trim().toLowerCase() === needle,
  );
  if (matches.length === 0) return null;
  if (ownerPartyId != null) {
    const sameOwner = matches.find(
      (row) => row.owner_party_id === ownerPartyId,
    );
    if (sameOwner) return sameOwner;
  }
  return matches[0] ?? null;
}

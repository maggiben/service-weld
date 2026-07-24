import type {
  CapacityUnit,
  Cylinder,
  CylinderCondition,
  GasCode,
} from "@weld/schemas";

export const TERMINAL_CYLINDER_STATES = new Set([
  "SOLD",
  "LOST",
  "BROKEN",
  "RETURNED_TO_SUPPLIER",
  "RETIRED",
]);

/** Cylinder available to start a rental delivery. */
export function isRentalPickable(
  item: Pick<
    Cylinder,
    | "state"
    | "ownership_basis"
    | "packaging"
    | "current_movement_id"
    | "current_holder_party_id"
  >,
): boolean {
  return (
    (item.state === "IN_STOCK_EMPTY" || item.state === "IN_STOCK_FULL") &&
    item.ownership_basis !== "CUSTOMER" &&
    item.packaging !== "BATTERY_MEMBER" &&
    item.current_movement_id == null &&
    item.current_holder_party_id == null
  );
}

/** Cylinder we own, available to sell from plant stock. */
export function isSellPickable(
  item: Pick<
    Cylinder,
    | "state"
    | "ownership_basis"
    | "packaging"
    | "current_movement_id"
    | "current_holder_party_id"
  >,
): boolean {
  return (
    (item.state === "IN_STOCK_EMPTY" || item.state === "IN_STOCK_FULL") &&
    item.ownership_basis === "OURS" &&
    item.packaging !== "BATTERY_MEMBER" &&
    item.current_movement_id == null &&
    item.current_holder_party_id == null
  );
}

/** Customer-owned cylinder available for refill. */
export function isRefillPickable(
  item: Pick<Cylinder, "ownership_basis" | "state" | "packaging">,
): boolean {
  return (
    item.ownership_basis === "CUSTOMER" &&
    !TERMINAL_CYLINDER_STATES.has(item.state) &&
    item.packaging !== "BATTERY_MEMBER"
  );
}

export function cylinderPickerLabel(
  option: Pick<
    Cylinder,
    | "serial_number"
    | "owner_name"
    | "gas_code"
    | "condition"
    | "capacity_m3"
    | "capacity_unit"
  >,
): string {
  const owner = option.owner_name ? ` · ${option.owner_name}` : "";
  const gas = option.gas_code ? ` · ${option.gas_code}` : "";
  const condition = option.condition ? ` · ${option.condition}` : "";
  const capacity =
    option.capacity_m3 != null
      ? ` · ${option.capacity_m3}${option.capacity_unit === "KG" ? "kg" : "m³"}`
      : "";
  return `${option.serial_number}${owner}${gas}${condition}${capacity}`;
}

export type MovementCylinderPrefill = {
  /** Set on the form: gas only when the cylinder is full. */
  gas_code: GasCode | null;
  /** True when gas was taken from a full cylinder's known contents. */
  gasFromCylinder: boolean;
  capacity_m3: number | null;
  capacity_unit: CapacityUnit;
  condition: CylinderCondition;
};

/**
 * Prefill delivery/refill fields from a picked cylinder.
 * Full → gas (+ condition). Empty → leave gas free; always expose known tank capacity.
 */
export function prefillMovementFromCylinder(
  cylinder: Pick<
    Cylinder,
    "condition" | "gas_code" | "capacity_m3" | "capacity_unit" | "state"
  >,
): MovementCylinderPrefill {
  const isFull =
    cylinder.condition === "FULL" || cylinder.state === "IN_STOCK_FULL";

  return {
    gas_code: isFull ? (cylinder.gas_code ?? null) : null,
    gasFromCylinder: isFull && cylinder.gas_code != null,
    capacity_m3: cylinder.capacity_m3,
    capacity_unit: cylinder.capacity_unit,
    condition: cylinder.condition,
  };
}

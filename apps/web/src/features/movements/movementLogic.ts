import type { Cylinder } from "@weld/schemas";

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
  option: Pick<Cylinder, "serial_number" | "owner_name" | "gas_code">,
): string {
  const owner = option.owner_name ? ` · ${option.owner_name}` : "";
  const gas = option.gas_code ? ` · ${option.gas_code}` : "";
  return `${option.serial_number}${owner}${gas}`;
}

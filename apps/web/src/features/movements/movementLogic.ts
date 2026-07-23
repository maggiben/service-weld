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
  c: Pick<
    Cylinder,
    | "state"
    | "ownership_basis"
    | "packaging"
    | "current_movement_id"
    | "current_holder_party_id"
  >,
): boolean {
  return (
    (c.state === "IN_STOCK_EMPTY" || c.state === "IN_STOCK_FULL") &&
    c.ownership_basis !== "CUSTOMER" &&
    c.packaging !== "BATTERY_MEMBER" &&
    c.current_movement_id == null &&
    c.current_holder_party_id == null
  );
}

/** Customer-owned cylinder available for refill. */
export function isRefillPickable(
  c: Pick<Cylinder, "ownership_basis" | "state" | "packaging">,
): boolean {
  return (
    c.ownership_basis === "CUSTOMER" &&
    !TERMINAL_CYLINDER_STATES.has(c.state) &&
    c.packaging !== "BATTERY_MEMBER"
  );
}

export function cylinderPickerLabel(
  option: Pick<Cylinder, "serial_number" | "owner_name" | "gas_code">,
): string {
  const owner = option.owner_name ? ` · ${option.owner_name}` : "";
  const gas = option.gas_code ? ` · ${option.gas_code}` : "";
  return `${option.serial_number}${owner}${gas}`;
}

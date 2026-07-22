/** Small pure formatters used across the back-office UI. */

import type { CapacityUnit } from "@weld/schemas";

export function dashIfEmpty(value: string | null | undefined): string {
  if (value == null || value.trim() === "") return "—";
  return value;
}

export function formatPartyLabel(id: number, name: string): string {
  return `#${id} ${name}`;
}

export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function boolLabel(value: boolean, yes = "sí", no = "no"): string {
  return value ? yes : no;
}

/** Format cylinder capacity with unit label (D-18). */
export function formatCapacity(
  value: number | null | undefined,
  unit: CapacityUnit | null | undefined = "M3",
  empty = "—",
): string {
  if (value == null) return empty;
  const suffix = unit === "KG" ? " kg" : " m³";
  return `${value}${suffix}`;
}

export function capacityUnitLabel(unit: CapacityUnit): string {
  return unit === "KG" ? "kg" : "m³";
}

/** Minimal charge-line shape for classifying rental vs sale rows. */
export type ChargeLineLike = {
  quantity: number;
  unit?: string | null;
  unit_price?: number | null;
  source_table?: string | null;
};

/** Rental / accessory rows billed by calendar days. */
export function isDayChargeLine(line: ChargeLineLike): boolean {
  return line.unit === "day";
}

/** Cylinder sale rows (one unit per line). */
export function isSaleChargeLine(line: ChargeLineLike): boolean {
  return line.source_table === "cylinder_sale" || line.unit === "unit";
}

/** Open rental movements (one cylinder per line), not accessories. */
export function isRentalCylinderChargeLine(line: ChargeLineLike): boolean {
  return line.unit === "day" && line.source_table === "movement_event";
}

/** Sum of day quantities only — sales/fills must not inflate cylinder-days. */
export function invoiceCylinderDays(
  lines: readonly ChargeLineLike[] | null | undefined,
): number {
  return (lines ?? [])
    .filter(isDayChargeLine)
    .reduce((sum, line) => sum + Number(line.quantity), 0);
}

export function countRentedCylinders(
  lines: readonly ChargeLineLike[] | null | undefined,
): number {
  return (lines ?? []).filter(isRentalCylinderChargeLine).length;
}

export function countSoldCylinders(
  lines: readonly ChargeLineLike[] | null | undefined,
): number {
  return (lines ?? []).filter(isSaleChargeLine).length;
}

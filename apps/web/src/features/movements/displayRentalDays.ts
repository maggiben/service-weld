import { businessTodayIso, calendarDaysBetween } from "@weld/domain";

export type DisplayRentalDaysRow = {
  rental_days: number | null;
  state: string;
  delivery_date?: string | null;
  movement_kind?: string | null;
};

function accruedDays(deliveryDate: string): number | string {
  try {
    return calendarDaysBetween(deliveryDate, businessTodayIso());
  } catch {
    return "—";
  }
}

/** Closed: stored rental_days. Open with delivery: days accrued through business today. */
export function displayRentalDays(row: DisplayRentalDaysRow): number | string {
  if (row.movement_kind === "REFILL" || row.movement_kind === "SUPPLIER_LOAN")
    return "—";
  if (row.rental_days != null) return row.rental_days;
  if (row.state === "OPEN" && row.delivery_date)
    return accruedDays(row.delivery_date);
  return "—";
}

import { businessTodayIso, calendarDaysBetween } from "@weld/domain";

export type DisplayRentalDaysRow = {
  rental_days: number | null;
  state: string;
  delivery_date?: string | null;
  movement_kind?: string | null;
};

/** Closed: stored rental_days. Open with delivery: days accrued through business today.
 *  REFILL (client-owned) is not a rental — never show rental days. */
export function displayRentalDays(row: DisplayRentalDaysRow): number | string {
  if (row.movement_kind === "REFILL") return "—";
  if (row.rental_days != null) return row.rental_days;
  if (row.state === "OPEN" && row.delivery_date) {
    try {
      return calendarDaysBetween(row.delivery_date, businessTodayIso());
    } catch {
      return "—";
    }
  }
  return "—";
}

/** Business-date helpers (Argentina timezone for "today"). */

export const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";

/** Today's date as YYYY-MM-DD in the business timezone. */
export function todayIso(
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** First day of the current business month (YYYY-MM-01). */
export function monthStartIso(
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  const today = todayIso(now, timeZone);
  return `${today.slice(0, 8)}01`;
}

/** Calendar year of an ISO date (YYYY-MM-DD). */
export function yearOfIso(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Last calendar day of `year`-`month` (1–12), optionally clamped to `asOf`. */
export function monthEndIso(
  year: number,
  month: number,
  asOf?: string,
): string {
  const last = new Date(Date.UTC(year, month, 0));
  const end = last.toISOString().slice(0, 10);
  if (asOf && asOf < end) return asOf;
  return end;
}

/** Format YYYY-MM-DD (or datetime prefix) as DD/MM/YYYY, else "—". */
export function formatDateDMY(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

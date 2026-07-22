import { DomainErrors } from "./errors";

/** D-13 — civil "today" in the business timezone (also used by BR-05). */
export const DEFAULT_BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";

export function businessTodayIso(
  now: Date = new Date(),
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Immutable capacity in m³ (002 R4 / C5). */
export class Capacity {
  private constructor(readonly m3: number) {}

  static of(m3: number): Capacity {
    if (!(m3 > 0) || !Number.isFinite(m3)) {
      throw DomainErrors.invalidCapacity();
    }
    return new Capacity(m3);
  }
}

/** Immutable ARS money — decimal, never float (002 C5). */
export class Money {
  private constructor(readonly amount: number) {}

  static of(amount: number): Money {
    if (!(amount >= 0) || !Number.isFinite(amount)) {
      throw DomainErrors.invalidMoney();
    }
    // Enforce 2 decimal places for ARS.
    const rounded = Math.round(amount * 100) / 100;
    if (Math.abs(rounded - amount) > 1e-9) {
      throw DomainErrors.invalidMoney();
    }
    return new Money(rounded);
  }
}

/** Calendar-day rental period (BR-03). */
export class RentalPeriod {
  private constructor(readonly days: number) {}

  static between(delivery: string, returnOrAsOf: string): RentalPeriod {
    const days = calendarDaysBetween(delivery, returnOrAsOf);
    if (days < 0) throw DomainErrors.returnBeforeDelivery();
    return new RentalPeriod(days);
  }

  static accrued(delivery: string, asOf: string): RentalPeriod {
    return RentalPeriod.between(delivery, asOf);
  }
}

/** ISO `yyyy-mm-dd` → UTC midnight Date. */
export function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw DomainErrors.dateOutOfRange("date");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw DomainErrors.dateOutOfRange("date");
  }
  return date;
}

/** Calendar days between two ISO dates (return − delivery). */
export function calendarDaysBetween(from: string, to: string): number {
  const a = parseIsoDate(from).getTime();
  const b = parseIsoDate(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Business date plausibility (BR-05): within [2000-01-01, today+30d].
 * `todayIso` is injectable for tests (default = UTC today).
 */
export function assertPlausibleBusinessDate(
  isoDate: string,
  todayIso?: string,
): void {
  const date = parseIsoDate(isoDate);
  const min = parseIsoDate("2000-01-01");
  const today = parseIsoDate(todayIso ?? businessTodayIso());
  const max = new Date(today.getTime() + 30 * 86_400_000);
  if (date < min || date > max) {
    throw DomainErrors.dateOutOfRange(isoDate);
  }
}

import { DomainErrors } from "./errors";
import { type CapacityUnit, Money, calendarDaysBetween } from "./value-objects";

export type RatePeriod = "DAILY" | "MONTHLY";

export interface RateCandidate {
  id: number;
  client_party_id: number | null;
  gas_code: string | null;
  /** Null = any cylinder size. Magnitude is in capacity_unit (D-18). */
  capacity_m3: number | null;
  capacity_unit: CapacityUnit;
  period: RatePeriod;
  amount: number;
  effective_from: string;
  effective_to: string | null;
}

/**
 * Whether a rate row applies to a lookup. Null dimensions are wildcards
 * ("any gas" / "any size"); a specific capacity matches magnitude + unit.
 */
function rateApplies(
  rate: RateCandidate,
  clientPartyId: number,
  gasCode: string | null,
  capacityM3: number | null,
  capacityUnit: CapacityUnit | null,
): boolean {
  if (rate.client_party_id != null && rate.client_party_id !== clientPartyId) {
    return false;
  }
  if (rate.gas_code != null) {
    if (gasCode == null || rate.gas_code !== gasCode) return false;
  }
  if (rate.capacity_m3 != null) {
    if (
      capacityM3 == null ||
      rate.capacity_m3 !== capacityM3 ||
      capacityUnit == null ||
      rate.capacity_unit !== capacityUnit
    ) {
      return false;
    }
  }
  return true;
}

/** Higher = more specific. Client > gas > capacity (009 R3). */
function rateSpecificity(rate: RateCandidate): number {
  return (
    (rate.client_party_id != null ? 4 : 0) +
    (rate.gas_code != null ? 2 : 0) +
    (rate.capacity_m3 != null ? 1 : 0)
  );
}

/**
 * Effective rate precedence (009 R3 / BR-19):
 * most specific match among active rows whose null dimensions act as wildcards.
 * Typical ladder: client+gas+size → client+gas → client+size → client →
 * gas+size → gas → size → global.
 */
export function resolveEffectiveRate(
  rates: readonly RateCandidate[],
  clientPartyId: number,
  gasCode: string | null,
  onDate: string,
  capacityM3: number | null = null,
  capacityUnit: CapacityUnit | null = null,
): RateCandidate | null {
  // Legacy callers that only pass magnitude assume m³ (D-18).
  const unit = capacityM3 != null ? (capacityUnit ?? "M3") : null;
  const active = rates.filter(
    (rate) =>
      rate.effective_from <= onDate &&
      (rate.effective_to == null || rate.effective_to >= onDate) &&
      rateApplies(rate, clientPartyId, gasCode, capacityM3, unit),
  );

  let best: RateCandidate | null = null;
  let bestScore = -1;
  for (const rate of active) {
    const score = rateSpecificity(rate);
    if (score > bestScore) {
      best = rate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Pick the rate date for a charge line.
 * - `history`: tarifa vigente as of period end (today) — open loans often
 *   predate the first `rental_rate` row; pricing at delivery would skip them.
 * - `period`: rate in force at the start of the billable window (009 C4/AC5).
 */
export function billingRateOnDate(params: {
  mode: "period" | "history";
  deliveryDate: string;
  periodStart: string;
  periodEnd: string;
}): string {
  if (params.mode === "history") return params.periodEnd;
  return params.deliveryDate > params.periodStart
    ? params.deliveryDate
    : params.periodStart;
}

/**
 * Resolve unit price for billing. Falls back to period-end rate, then optional
 * client daily_rate_default (same as rental report).
 */
export function resolveBillingUnitPrice(params: {
  rates: readonly RateCandidate[];
  clientPartyId: number;
  gasCode: string | null;
  capacityM3?: number | null;
  capacityUnit?: CapacityUnit | null;
  mode: "period" | "history";
  deliveryDate: string;
  periodStart: string;
  periodEnd: string;
  dailyRateDefault?: number | null;
}): Money | null {
  const capacityM3 = params.capacityM3 ?? null;
  const capacityUnit = params.capacityUnit ?? null;
  const preferred = billingRateOnDate(params);
  let rate = resolveEffectiveRate(
    params.rates,
    params.clientPartyId,
    params.gasCode,
    preferred,
    capacityM3,
    capacityUnit,
  );
  if (!rate && preferred !== params.periodEnd) {
    rate = resolveEffectiveRate(
      params.rates,
      params.clientPartyId,
      params.gasCode,
      params.periodEnd,
      capacityM3,
      capacityUnit,
    );
  }
  if (rate) return dailyUnitPrice(rate);
  const fallback = params.dailyRateDefault;
  if (fallback != null && fallback > 0) return Money.of(fallback);
  return null;
}

/** Daily unit price; MONTHLY → amount/30 (D-14). */
export function dailyUnitPrice(rate: RateCandidate): Money {
  if (rate.period === "DAILY") return Money.of(rate.amount);
  const daily = Math.round((rate.amount / 30) * 100) / 100;
  return Money.of(daily);
}

/**
 * Days of a movement that fall inside [periodStart, periodEnd] (inclusive end
 * as calendar difference). D-14: no min-day; same-day → 0.
 *
 * Open rentals (`returnDate` null) accrue only through `asOfDate` (009 AC4 /
 * BR-03), never into future days of a mid-month billing window. Defaults to
 * `periodEnd` when omitted (past closed periods / callers that already clipped).
 */
export function billableDaysInPeriod(params: {
  deliveryDate: string;
  returnDate: string | null;
  periodStart: string;
  periodEnd: string;
  /** Cap for still-open rentals; billing/reports pass business today. */
  asOfDate?: string;
}): number {
  const start =
    params.deliveryDate > params.periodStart
      ? params.deliveryDate
      : params.periodStart;
  const openCap = params.asOfDate ?? params.periodEnd;
  const movementEnd = params.returnDate ?? openCap;
  const end = movementEnd < params.periodEnd ? movementEnd : params.periodEnd;
  if (end < start) return 0;
  return calendarDaysBetween(start, end);
}

export function rentalChargeAmount(days: number, unitPrice: Money): Money {
  if (days < 0) throw DomainErrors.returnBeforeDelivery();
  const raw = Math.round(days * unitPrice.amount * 100) / 100;
  return Money.of(raw);
}

/** Two rate rows overlap on the same (client, gas, capacity) key (409 RATE_OVERLAP). */
export function ratesOverlap(
  left: Pick<RateCandidate, "effective_from" | "effective_to">,
  right: Pick<RateCandidate, "effective_from" | "effective_to">,
): boolean {
  const aTo = left.effective_to ?? "9999-12-31";
  const bTo = right.effective_to ?? "9999-12-31";
  return left.effective_from <= bTo && right.effective_from <= aTo;
}

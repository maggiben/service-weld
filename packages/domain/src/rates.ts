import { DomainErrors } from "./errors";
import { Money, calendarDaysBetween } from "./value-objects";

export type RatePeriod = "DAILY" | "MONTHLY";

export interface RateCandidate {
  id: number;
  client_party_id: number | null;
  gas_code: string | null;
  period: RatePeriod;
  amount: number;
  effective_from: string;
  effective_to: string | null;
}

/**
 * Effective rate precedence (009 R3 / BR-19):
 * client+gas → client → gas default → global default.
 */
export function resolveEffectiveRate(
  rates: readonly RateCandidate[],
  clientPartyId: number,
  gasCode: string | null,
  onDate: string,
): RateCandidate | null {
  const active = rates.filter(
    (r) =>
      r.effective_from <= onDate &&
      (r.effective_to == null || r.effective_to >= onDate),
  );

  const find = (pred: (r: RateCandidate) => boolean): RateCandidate | null =>
    active.find(pred) ?? null;

  if (gasCode != null) {
    const clientGas = find(
      (r) => r.client_party_id === clientPartyId && r.gas_code === gasCode,
    );
    if (clientGas) return clientGas;
  }

  const clientDefault = find(
    (r) => r.client_party_id === clientPartyId && r.gas_code == null,
  );
  if (clientDefault) return clientDefault;

  if (gasCode != null) {
    const gasDefault = find(
      (r) => r.client_party_id == null && r.gas_code === gasCode,
    );
    if (gasDefault) return gasDefault;
  }

  return find((r) => r.client_party_id == null && r.gas_code == null);
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
 */
export function billableDaysInPeriod(params: {
  deliveryDate: string;
  returnDate: string | null;
  periodStart: string;
  periodEnd: string;
}): number {
  const start =
    params.deliveryDate > params.periodStart
      ? params.deliveryDate
      : params.periodStart;
  const movementEnd = params.returnDate ?? params.periodEnd;
  const end = movementEnd < params.periodEnd ? movementEnd : params.periodEnd;
  if (end < start) return 0;
  return calendarDaysBetween(start, end);
}

export function rentalChargeAmount(days: number, unitPrice: Money): Money {
  if (days < 0) throw DomainErrors.returnBeforeDelivery();
  const raw = Math.round(days * unitPrice.amount * 100) / 100;
  return Money.of(raw);
}

/** Two rate rows overlap on the same (client, gas) key (409 RATE_OVERLAP). */
export function ratesOverlap(
  a: Pick<RateCandidate, "effective_from" | "effective_to">,
  b: Pick<RateCandidate, "effective_from" | "effective_to">,
): boolean {
  const aTo = a.effective_to ?? "9999-12-31";
  const bTo = b.effective_to ?? "9999-12-31";
  return a.effective_from <= bTo && b.effective_from <= aTo;
}

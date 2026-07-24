import { type CapacityUnit, Money } from "./value-objects";
import { ratesOverlap } from "./rates";

export interface RefillRateCandidate {
  id: number;
  gas_code: string | null;
  /** Null = any cylinder size. Magnitude is in capacity_unit (D-18). */
  capacity_m3: number | null;
  capacity_unit: CapacityUnit;
  amount: number;
  effective_from: string;
  effective_to: string | null;
}

function refillRateApplies(
  rate: RefillRateCandidate,
  gasCode: string | null,
  capacityM3: number | null,
  capacityUnit: CapacityUnit | null,
): boolean {
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

/** Higher = more specific. Gas > capacity (014 — not client-specific). */
function refillRateSpecificity(rate: RefillRateCandidate): number {
  return (rate.gas_code != null ? 2 : 0) + (rate.capacity_m3 != null ? 1 : 0);
}

/**
 * Effective per-fill price (014 / D-19): most specific active refill_rate
 * whose null dimensions act as wildcards (gas × size only).
 */
export function resolveRefillPrice(
  rates: readonly RefillRateCandidate[],
  gasCode: string | null,
  onDate: string,
  capacityM3: number | null = null,
  capacityUnit: CapacityUnit | null = null,
): RefillRateCandidate | null {
  const unit = capacityM3 != null ? (capacityUnit ?? "M3") : null;
  const active = rates.filter(
    (rate) =>
      rate.effective_from <= onDate &&
      (rate.effective_to == null || rate.effective_to >= onDate) &&
      refillRateApplies(rate, gasCode, capacityM3, unit),
  );

  let best: RefillRateCandidate | null = null;
  let bestScore = -1;
  for (const rate of active) {
    const score = refillRateSpecificity(rate);
    if (score > bestScore) {
      best = rate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Resolve fill unit price for billing. Prefers rate on delivery (or period
 * start), then falls back to period-end so late-entered rates still apply.
 */
export function resolveRefillUnitPrice(params: {
  rates: readonly RefillRateCandidate[];
  gasCode: string | null;
  capacityM3?: number | null;
  capacityUnit?: CapacityUnit | null;
  deliveryDate: string;
  periodStart: string;
  periodEnd: string;
}): Money | null {
  const capacityM3 = params.capacityM3 ?? null;
  const capacityUnit = params.capacityUnit ?? null;
  const preferred =
    params.deliveryDate > params.periodStart
      ? params.deliveryDate
      : params.periodStart;
  let rate = resolveRefillPrice(
    params.rates,
    params.gasCode,
    preferred,
    capacityM3,
    capacityUnit,
  );
  if (!rate && preferred !== params.periodEnd) {
    rate = resolveRefillPrice(
      params.rates,
      params.gasCode,
      params.periodEnd,
      capacityM3,
      capacityUnit,
    );
  }
  if (!rate) return null;
  return Money.of(rate.amount);
}

/** One fill → quantity 1; amount is the resolved per-fill price. */
export function refillChargeAmount(unitPrice: Money): Money {
  return Money.of(Math.round(unitPrice.amount * 100) / 100);
}

export { ratesOverlap as refillRatesOverlap };

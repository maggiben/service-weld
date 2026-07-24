/** Pure aggregations for the management dashboard (007 R2 / US-30). */

import type {
  FleetRow,
  FloatAgingRow,
  LossReportRow,
  RefillReportRow,
  RentalReportRow,
} from "@weld/schemas";

export type ChartDatum = { id: string; label: string; value: number };

export type RentalTotals = {
  revenue: number;
  rental_days: number;
  movement_count: number;
  client_count: number;
};

export type RefillTotals = {
  revenue: number;
  refill_count: number;
  client_count: number;
};

export type FleetKpis = {
  total: number;
  in_stock: number;
  at_client: number;
  at_supplier: number;
  lost_or_broken: number;
  /** Share of fleet currently at clients (0–100). */
  float_utilization_pct: number;
};

const IN_STOCK_STATES = new Set(["IN_STOCK_EMPTY", "IN_STOCK_FULL"]);
const LOST_BROKEN_STATES = new Set(["LOST", "BROKEN"]);

const AGING_BUCKET_ORDER = ["≤30", ">30", ">90", ">180", ">365"] as const;

export function sumFleetCounts(rows: readonly FleetRow[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

export function fleetKpisFromStateRows(rows: readonly FleetRow[]): FleetKpis {
  let total = 0;
  let in_stock = 0;
  let at_client = 0;
  let at_supplier = 0;
  let lost_or_broken = 0;

  for (const row of rows) {
    total += row.count;
    const state = row.state ?? row.group_key;
    if (IN_STOCK_STATES.has(state)) in_stock += row.count;
    else if (state === "AT_CLIENT") at_client += row.count;
    else if (state === "AT_SUPPLIER") at_supplier += row.count;
    else if (LOST_BROKEN_STATES.has(state)) lost_or_broken += row.count;
  }

  return {
    total,
    in_stock,
    at_client,
    at_supplier,
    lost_or_broken,
    float_utilization_pct:
      total === 0 ? 0 : Math.round((at_client / total) * 1000) / 10,
  };
}

/** Pie/bar series from fleet rows; prefers `state`/`gas_code` over group_key. */
export function fleetChartData(
  rows: readonly FleetRow[],
  key: "state" | "gas_code" | "group_key" = "group_key",
  labelFor: (id: string) => string = (id) => id,
): ChartDatum[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const raw =
      key === "state"
        ? (row.state ?? row.group_key)
        : key === "gas_code"
          ? (row.gas_code ?? row.group_key)
          : row.group_key;
    const id = raw == null || raw === "" ? "—" : String(raw);
    totals.set(id, (totals.get(id) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([id, value]) => ({ id, label: labelFor(id), value }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value);
}

export function agingBucketChartData(
  rows: readonly FloatAgingRow[],
  labelFor: (bucket: string) => string = (bucket) => bucket,
): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const bucket of AGING_BUCKET_ORDER) counts.set(bucket, 0);
  for (const row of rows) {
    counts.set(row.bucket, (counts.get(row.bucket) ?? 0) + 1);
  }
  return AGING_BUCKET_ORDER.map((bucket) => ({
    id: bucket,
    label: labelFor(bucket),
    value: counts.get(bucket) ?? 0,
  }));
}

export function rentalTotals(rows: readonly RentalReportRow[]): RentalTotals {
  let revenue = 0;
  let rental_days = 0;
  let movement_count = 0;
  const clients = new Set<number>();
  for (const row of rows) {
    revenue += row.revenue;
    rental_days += row.rental_days;
    movement_count += row.movement_count;
    clients.add(row.client_party_id);
  }
  return {
    revenue,
    rental_days,
    movement_count,
    client_count: clients.size,
  };
}

export function refillTotals(rows: readonly RefillReportRow[]): RefillTotals {
  let revenue = 0;
  let refill_count = 0;
  const clients = new Set<number>();
  for (const row of rows) {
    revenue += row.revenue;
    refill_count += row.refill_count;
    clients.add(row.client_party_id);
  }
  return {
    revenue: Math.round(revenue * 100) / 100,
    refill_count,
    client_count: clients.size,
  };
}

/** Chart series by gas for refill count + revenue. */
export function refillChartByGas(
  rows: readonly RefillReportRow[],
): Array<{ id: string; label: string; count: number; revenue: number }> {
  const byGas = new Map<string, { count: number; revenue: number }>();
  for (const row of rows) {
    const id = row.gas_code ?? "—";
    const prev = byGas.get(id) ?? { count: 0, revenue: 0 };
    prev.count += row.refill_count;
    prev.revenue = Math.round((prev.revenue + row.revenue) * 100) / 100;
    byGas.set(id, prev);
  }
  return [...byGas.entries()]
    .map(([id, item]) => ({
      id,
      label: id,
      count: item.count,
      revenue: item.revenue,
    }))
    .sort((left, right) => right.revenue - left.revenue);
}

type ClientRevenueRow = {
  client_party_id: number;
  client_name: string;
  revenue: number;
};

function accumulateClientRevenue(
  byClient: Map<number, { name: string; revenue: number }>,
  rows: readonly ClientRevenueRow[],
): void {
  for (const row of rows) {
    const prev = byClient.get(row.client_party_id);
    if (prev) {
      prev.revenue += row.revenue;
    } else {
      byClient.set(row.client_party_id, {
        name: row.client_name,
        revenue: row.revenue,
      });
    }
  }
}

/**
 * Top clients by combined rental + refill revenue (horizontal bar chart).
 * Pass only rental rows to rank by rental alone.
 */
export function topClientsByRevenue(
  rentalRows: readonly RentalReportRow[],
  limit = 8,
  refillRows: readonly RefillReportRow[] = [],
): ChartDatum[] {
  const byClient = new Map<number, { name: string; revenue: number }>();
  accumulateClientRevenue(byClient, rentalRows);
  accumulateClientRevenue(byClient, refillRows);
  return [...byClient.entries()]
    .map(([id, item]) => ({
      id: String(id),
      label: item.name,
      value: Math.round(item.revenue * 100) / 100,
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

/** Round combined period totals for year-slice charts. */
export function yearRevenueSlice(
  rental: number,
  refill: number,
): { rental: number; refill: number } {
  return {
    rental: Math.round(rental),
    refill: Math.round(refill),
  };
}

export function lossTotalCount(rows: readonly LossReportRow[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}

export type PeriodGrain = "month" | "quarter" | "semester";

export type YearSlice = {
  id: string;
  /** i18n key under dashboard.grain_labels.* */
  labelKey: string;
  start: string;
  end: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function monthStart(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

function monthEnd(year: number, month: number, asOf: string): string {
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return asOf < last ? asOf : last;
}

/** Year-to-date slices for charts (month / quarter / semester). */
export function yearSlices(
  year: number,
  grain: PeriodGrain,
  asOf: string,
): YearSlice[] {
  if (grain === "month") {
    const slices: YearSlice[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const start = monthStart(year, month);
      if (start > asOf) break;
      slices.push({
        id: `${year}-m${pad2(month)}`,
        labelKey: `month_${month}`,
        start,
        end: monthEnd(year, month, asOf),
      });
    }
    return slices;
  }

  if (grain === "quarter") {
    const slices: YearSlice[] = [];
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const firstMonth = (quarter - 1) * 3 + 1;
      const lastMonth = firstMonth + 2;
      const start = monthStart(year, firstMonth);
      if (start > asOf) break;
      slices.push({
        id: `${year}-q${quarter}`,
        labelKey: `quarter_${quarter}`,
        start,
        end: monthEnd(year, lastMonth, asOf),
      });
    }
    return slices;
  }

  const slices: YearSlice[] = [];
  for (let half = 1; half <= 2; half += 1) {
    const firstMonth = half === 1 ? 1 : 7;
    const lastMonth = half === 1 ? 6 : 12;
    const start = monthStart(year, firstMonth);
    if (start > asOf) break;
    slices.push({
      id: `${year}-h${half}`,
      labelKey: `semester_${half}`,
      start,
      end: monthEnd(year, lastMonth, asOf),
    });
  }
  return slices;
}

/** First day of the calendar month `delta` months from `year`-`month` (1–12). */
function shiftMonthStart(year: number, month: number, delta: number): string {
  const absolute = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = (absolute % 12) + 1;
  return monthStart(nextYear, nextMonth);
}

/**
 * KPI filter preset ending at `asOf`:
 * - month → current calendar month
 * - quarter → last 3 calendar months (incl. current)
 * - semester → last 6 calendar months (incl. current)
 *
 * Trailing windows so Mes / Trimestre / Semestre always widen the range
 * (calendar QTD/HTD coincide at the start of a quarter/semester, e.g. July).
 */
export function currentPeriodRange(
  grain: PeriodGrain,
  asOf: string,
): { start: string; end: string } {
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  const monthsBack = grain === "month" ? 1 : grain === "quarter" ? 3 : 6;
  return {
    start: shiftMonthStart(year, month, -(monthsBack - 1)),
    end: asOf,
  };
}

export function formatArs(amount: number, locale = "es-AR"): string {
  const rounded = Math.round(amount);
  return `${formatInteger(rounded, locale)} ARS`;
}

export function formatInteger(value: number, locale = "es-AR"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    value,
  );
}

/**
 * Green heat from muted (low revenue) to saturated (high).
 * `ratio` in [0, 1].
 */
export function revenueHeatColor(ratio: number): string {
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  const saturation = 28 + clamped * 42;
  const lightness = 72 - clamped * 40;
  return `hsl(122 ${saturation}% ${lightness}%)`;
}

/** One color per datum; higher `value` → more saturated. */
export function revenueHeatColors(items: readonly ChartDatum[]): string[] {
  if (items.length === 0) return [];
  let min = items[0]!.value;
  let max = items[0]!.value;
  for (const item of items) {
    if (item.value < min) min = item.value;
    if (item.value > max) max = item.value;
  }
  const span = max - min;
  return items.map((item) =>
    revenueHeatColor(span === 0 ? 1 : (item.value - min) / span),
  );
}

/** Shorten long axis labels without losing the start of the name. */
export function shortenChartLabel(label: string, max = 20): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

/** Page through float-aging until exhausted or `maxPages` (API max limit=200). */
export async function collectFloatAgingPages(
  fetchPage: (cursor: string | undefined) => Promise<{
    data: FloatAgingRow[];
    page: { has_more: boolean; next_cursor: string | null };
  }>,
  maxPages = 5,
): Promise<FloatAgingRow[]> {
  const rows: FloatAgingRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    rows.push(...result.data);
    if (!result.page.has_more || !result.page.next_cursor) break;
    cursor = result.page.next_cursor;
  }
  return rows;
}

import {
  countRentedCylinders,
  countSoldCylinders,
  invoiceCylinderDays,
  isDayChargeLine,
  isRentalCylinderChargeLine,
  isSaleChargeLine,
} from "@weld/domain";

type ChargeLine = {
  id?: number;
  quantity: number;
  unit?: string | null;
  unit_price?: number | null;
  amount?: number;
  source_table?: string | null;
};

type InvoiceLike = {
  total_days?: number | null;
  charge_lines?: ChargeLine[] | null;
};

export type BillingInvoiceLocationFilter = {
  clientPartyId?: number | null;
  location?:
    { kind: "locality"; id: number } | { kind: "territory"; id: number } | null;
};

type BillingInvoiceRow = {
  client_party_id: number;
  client_locality_id?: number | null;
  client_territory_id?: number | null;
};

/**
 * View filter for the billing invoice grid — mirrors the client picker
 * (client / locality / territory) without regenerating the run.
 */
export function filterBillingInvoices<T extends BillingInvoiceRow>(
  invoices: readonly T[],
  filter: BillingInvoiceLocationFilter,
): T[] {
  if (filter.clientPartyId != null) {
    return invoices.filter(
      (invoice) => invoice.client_party_id === filter.clientPartyId,
    );
  }
  if (filter.location?.kind === "locality") {
    const localityId = filter.location.id;
    return invoices.filter(
      (invoice) => invoice.client_locality_id === localityId,
    );
  }
  if (filter.location?.kind === "territory") {
    const territoryId = filter.location.id;
    return invoices.filter(
      (invoice) => invoice.client_territory_id === territoryId,
    );
  }
  return [...invoices];
}

export function invoiceTotalDays(invoice: InvoiceLike): number {
  if (invoice.charge_lines != null) {
    return invoiceCylinderDays(invoice.charge_lines);
  }
  if (invoice.total_days != null) return invoice.total_days;
  return 0;
}

export function invoiceRentedCylinders(invoice: InvoiceLike): number {
  return countRentedCylinders(invoice.charge_lines);
}

export function invoiceSoldCylinders(invoice: InvoiceLike): number {
  return countSoldCylinders(invoice.charge_lines);
}

/** Sum of amounts for the selected charge-line ids (draft selection). */
export function selectedChargeLinesTotal(
  lines: readonly ChargeLine[],
  selectedIds: ReadonlySet<number> | readonly number[],
): number {
  const keep = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const total = lines
    .filter((line) => line.id != null && keep.has(line.id))
    .reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
  return Math.round(total * 100) / 100;
}

export function deferredChargeLinesTotal(
  lines: readonly ChargeLine[],
  selectedIds: ReadonlySet<number> | readonly number[],
): number {
  const keep = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const total = lines
    .filter((line) => line.id == null || !keep.has(line.id))
    .reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
  return Math.round(total * 100) / 100;
}

function rentalCylinderLines(invoice: InvoiceLike): ChargeLine[] {
  return (invoice.charge_lines ?? []).filter(isRentalCylinderChargeLine);
}

export function invoiceDaysBreakdownParams(invoice: InvoiceLike): {
  kind: "empty" | "uniform" | "mixed";
  cylinders: number;
  days?: number;
  total: number;
} {
  const lines = rentalCylinderLines(invoice);
  const cylinders = lines.length;
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (cylinders === 0) return { kind: "empty", cylinders: 0, total: 0 };

  const quantities = lines.map((line) => line.quantity);
  const allSame = quantities.every((item) => item === quantities[0]);
  if (allSame) {
    return {
      kind: "uniform",
      cylinders,
      days: quantities[0],
      total,
    };
  }
  return { kind: "mixed", cylinders, total };
}

export function formatInvoiceDaysBreakdown(
  invoice: InvoiceLike,
  translate: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const params = invoiceDaysBreakdownParams(invoice);
  if (params.kind === "empty") return "—";
  if (params.kind === "uniform") {
    return translate("billing.columns.days_breakdown_uniform", {
      cylinders: params.cylinders,
      days: params.days,
      total: params.total,
    });
  }
  return translate("billing.columns.days_breakdown_mixed", {
    cylinders: params.cylinders,
    total: params.total,
  });
}

function formatMoney(amount: number): string {
  return Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Daily rental unit price on the invoice grid (rentals only — never sale prices).
 */
export function formatInvoiceDailyRate(
  invoice: InvoiceLike,
  translate: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const lines = (invoice.charge_lines ?? []).filter(isDayChargeLine);
  const prices = lines
    .map((line) => (line.unit_price == null ? null : Number(line.unit_price)))
    .filter(
      (price): price is number => price != null && Number.isFinite(price),
    );
  if (prices.length === 0) return "—";

  const first = prices[0]!;
  const allSame = prices.every((price) => price === first);
  if (allSame) {
    return translate("billing.columns.daily_rate_value", {
      price: formatMoney(first),
    });
  }

  return translate("billing.columns.daily_rate_mixed", {
    min: formatMoney(Math.min(...prices)),
    max: formatMoney(Math.max(...prices)),
  });
}

export { isDayChargeLine, isSaleChargeLine, isRentalCylinderChargeLine };

type ChargeLine = { quantity: number; unit_price?: number };

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
  if (invoice.total_days != null) return invoice.total_days;
  return (invoice.charge_lines ?? []).reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
}

export function invoiceDaysBreakdownParams(invoice: InvoiceLike): {
  kind: "empty" | "uniform" | "mixed";
  cylinders: number;
  days?: number;
  total: number;
} {
  const lines = invoice.charge_lines ?? [];
  const cylinders = lines.length;
  const total = invoiceTotalDays(invoice);
  if (cylinders === 0) return { kind: "empty", cylinders: 0, total };

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

/** Daily unit price shown on the invoice grid (uniform or min–max when mixed). */
export function formatInvoiceDailyRate(
  invoice: InvoiceLike,
  translate: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const lines = invoice.charge_lines ?? [];
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

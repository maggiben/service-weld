type ChargeLine = { quantity: number };

type InvoiceLike = {
  total_days?: number | null;
  charge_lines?: ChargeLine[] | null;
};

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

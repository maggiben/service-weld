import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { InvoiceStatus } from "./enums";

export const ChargeLine = zod.object({
  id: zod.number().int(),
  invoice_id: zod.number().int(),
  source_table: zod.string(),
  source_id: zod.number().int(),
  description: zod.string(),
  quantity: zod.number(),
  unit: zod.string(),
  unit_price: zod.number(),
  amount: zod.number(),
});
export type ChargeLine = zod.infer<typeof ChargeLine>;

export const Invoice = zod.object({
  id: zod.number().int(),
  billing_run_id: zod.number().int().nullable().optional(),
  client_party_id: zod.number().int(),
  client_name: zod.string().optional(),
  /** Locality where the client (and thus stock in their custody) is located. */
  client_locality_id: zod.number().int().nullable().optional(),
  client_locality_name: zod.string().nullable().optional(),
  period_start: IsoDate,
  period_end: IsoDate,
  status: InvoiceStatus,
  /** Sum of charge-line amounts in ARS (not days). */
  total: zod.number(),
  /** Sum of billable days (charge-line quantities) for this invoice. */
  total_days: zod.number().optional(),
  created_at: zod.string().datetime(),
  version: zod.number().int(),
  charge_lines: zod.array(ChargeLine).optional(),
});
export type Invoice = zod.infer<typeof Invoice>;

export const BillingRun = zod.object({
  id: zod.number().int(),
  period_start: IsoDate,
  period_end: IsoDate,
  client_party_id: zod.number().int().nullable(),
  status: InvoiceStatus,
  created_at: zod.string().datetime(),
  invoice_count: zod.number().int().optional(),
  /** Sum of invoice totals in ARS. */
  total: zod.number().optional(),
  /** Sum of billable days across all invoices in the run. */
  total_days: zod.number().optional(),
  /**
   * Movements with billable days in scope that were dropped because no
   * rental_rate (and no client daily_rate_default) resolved. Only set on
   * freshly created drafts — not persisted.
   */
  skipped_no_rate: zod.number().int().nonnegative().optional(),
});
export type BillingRun = zod.infer<typeof BillingRun>;

export const CreateBillingRunInput = zod
  .object({
    /**
     * Required for `period` mode. Ignored for `history` (always from inception → today).
     */
    period_start: IsoDate.optional(),
    period_end: IsoDate.optional(),
    /**
     * `period` (default): rentals that overlap [period_start, period_end]
     * (delivered on/before end and still open or returned on/after start);
     * days are clipped to the window.
     * `history`: all still-open rentals from the oldest delivery in scope through today
     * (picker dates ignored; period_start is resolved from the first open movement).
     */
    mode: zod.enum(["period", "history"]).default("period"),
    /** Limit to one client. Takes precedence over locality/territory scope. */
    client_party_id: zod.number().int().nullable().optional(),
    /**
     * Limit to clients in this locality (ignored when client_party_id is set).
     * Takes precedence over territory_id.
     */
    locality_id: zod.number().int().nullable().optional(),
    /** Limit to clients in this territory (ignored when client_party_id or locality_id is set). */
    territory_id: zod.number().int().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "history") return;
    if (!value.period_start) {
      ctx.addIssue({
        code: zod.ZodIssueCode.custom,
        path: ["period_start"],
        message: "Required for period mode",
      });
    }
    if (!value.period_end) {
      ctx.addIssue({
        code: zod.ZodIssueCode.custom,
        path: ["period_end"],
        message: "Required for period mode",
      });
    }
  });
export type CreateBillingRunInput = zod.infer<typeof CreateBillingRunInput>;

export const BillingRunDetail = BillingRun.extend({
  invoices: zod.array(Invoice),
});
export type BillingRunDetail = zod.infer<typeof BillingRunDetail>;

export const BillingExportPayload = zod.object({
  run_id: zod.number().int(),
  exported_at: zod.string().datetime(),
  period_start: IsoDate,
  period_end: IsoDate,
  invoices: zod.array(
    zod.object({
      invoice_id: zod.number().int(),
      client_party_id: zod.number().int(),
      client_name: zod.string().optional(),
      total: zod.number(),
      lines: zod.array(
        zod.object({
          source_table: zod.string(),
          source_id: zod.number().int(),
          description: zod.string(),
          quantity: zod.number(),
          unit: zod.string(),
          unit_price: zod.number(),
          amount: zod.number(),
        }),
      ),
    }),
  ),
});
export type BillingExportPayload = zod.infer<typeof BillingExportPayload>;

export const InvoiceListQuery = PaginationQuery.extend({
  sort: zod.enum(["period_start", "-period_start"]).default("-period_start"),
  "filter[client_party_id]": zod.coerce.number().int().optional(),
  "filter[status]": InvoiceStatus.optional(),
  "filter[billing_run_id]": zod.coerce.number().int().optional(),
});
export type InvoiceListQuery = zod.infer<typeof InvoiceListQuery>;

export const InvoiceListResponse = paginated(Invoice);
export type InvoiceListResponse = zod.infer<typeof InvoiceListResponse>;

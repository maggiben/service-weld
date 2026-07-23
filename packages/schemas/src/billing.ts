import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { InvoiceStatus } from "./enums";

export const ChargeLine = z.object({
  id: z.number().int(),
  invoice_id: z.number().int(),
  source_table: z.string(),
  source_id: z.number().int(),
  description: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unit_price: z.number(),
  amount: z.number(),
});
export type ChargeLine = z.infer<typeof ChargeLine>;

export const Invoice = z.object({
  id: z.number().int(),
  billing_run_id: z.number().int().nullable().optional(),
  client_party_id: z.number().int(),
  client_name: z.string().optional(),
  /** Locality where the client (and thus stock in their custody) is located. */
  client_locality_id: z.number().int().nullable().optional(),
  client_locality_name: z.string().nullable().optional(),
  period_start: IsoDate,
  period_end: IsoDate,
  status: InvoiceStatus,
  /** Sum of charge-line amounts in ARS (not days). */
  total: z.number(),
  /** Sum of billable days (charge-line quantities) for this invoice. */
  total_days: z.number().optional(),
  created_at: z.string().datetime(),
  version: z.number().int(),
  charge_lines: z.array(ChargeLine).optional(),
});
export type Invoice = z.infer<typeof Invoice>;

export const BillingRun = z.object({
  id: z.number().int(),
  period_start: IsoDate,
  period_end: IsoDate,
  client_party_id: z.number().int().nullable(),
  status: InvoiceStatus,
  created_at: z.string().datetime(),
  invoice_count: z.number().int().optional(),
  /** Sum of invoice totals in ARS. */
  total: z.number().optional(),
  /** Sum of billable days across all invoices in the run. */
  total_days: z.number().optional(),
  /**
   * Movements with billable days in scope that were dropped because no
   * rental_rate (and no client daily_rate_default) resolved. Only set on
   * freshly created drafts — not persisted.
   */
  skipped_no_rate: z.number().int().nonnegative().optional(),
});
export type BillingRun = z.infer<typeof BillingRun>;

export const CreateBillingRunInput = z
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
    mode: z.enum(["period", "history"]).default("period"),
    /** Limit to one client. Takes precedence over locality/territory scope. */
    client_party_id: z.number().int().nullable().optional(),
    /**
     * Limit to clients in this locality (ignored when client_party_id is set).
     * Takes precedence over territory_id.
     */
    locality_id: z.number().int().nullable().optional(),
    /** Limit to clients in this territory (ignored when client_party_id or locality_id is set). */
    territory_id: z.number().int().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "history") return;
    if (!value.period_start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["period_start"],
        message: "Required for period mode",
      });
    }
    if (!value.period_end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["period_end"],
        message: "Required for period mode",
      });
    }
  });
export type CreateBillingRunInput = z.infer<typeof CreateBillingRunInput>;

export const BillingRunDetail = BillingRun.extend({
  invoices: z.array(Invoice),
});
export type BillingRunDetail = z.infer<typeof BillingRunDetail>;

export const BillingExportPayload = z.object({
  run_id: z.number().int(),
  exported_at: z.string().datetime(),
  period_start: IsoDate,
  period_end: IsoDate,
  invoices: z.array(
    z.object({
      invoice_id: z.number().int(),
      client_party_id: z.number().int(),
      client_name: z.string().optional(),
      total: z.number(),
      lines: z.array(
        z.object({
          source_table: z.string(),
          source_id: z.number().int(),
          description: z.string(),
          quantity: z.number(),
          unit: z.string(),
          unit_price: z.number(),
          amount: z.number(),
        }),
      ),
    }),
  ),
});
export type BillingExportPayload = z.infer<typeof BillingExportPayload>;

export const InvoiceListQuery = PaginationQuery.extend({
  sort: z.enum(["period_start", "-period_start"]).default("-period_start"),
  "filter[client_party_id]": z.coerce.number().int().optional(),
  "filter[status]": InvoiceStatus.optional(),
  "filter[billing_run_id]": z.coerce.number().int().optional(),
});
export type InvoiceListQuery = z.infer<typeof InvoiceListQuery>;

export const InvoiceListResponse = paginated(Invoice);
export type InvoiceListResponse = z.infer<typeof InvoiceListResponse>;

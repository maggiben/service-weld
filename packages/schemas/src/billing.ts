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

export const InvoiceArcaAuthorization = zod.object({
  cae: zod.string().nullable(),
  cae_due_date: IsoDate.nullable(),
  cbte_tipo: zod.number().int().nullable(),
  pto_vta: zod.number().int().nullable(),
  cbte_nro: zod.number().int().nullable(),
  cbte_fch: IsoDate.nullable(),
  doc_tipo: zod.number().int().nullable(),
  doc_nro: zod.number().int().nullable(),
  condicion_iva_receptor: zod.number().int().nullable(),
  imp_neto: zod.number().nullable(),
  imp_iva: zod.number().nullable(),
  imp_total: zod.number().nullable(),
  arca_environment: zod.enum(["HOMOLOGATION", "PRODUCTION"]).nullable(),
  arca_qr_url: zod.string().nullable(),
  authorized_at: zod.string().datetime().nullable(),
});
export type InvoiceArcaAuthorization = zod.infer<
  typeof InvoiceArcaAuthorization
>;

export const Invoice = zod.object({
  id: zod.number().int(),
  billing_run_id: zod.number().int().nullable().optional(),
  client_party_id: zod.number().int(),
  client_name: zod.string().optional(),
  client_cuit: zod.string().nullable().optional(),
  client_address: zod.string().nullable().optional(),
  /** Locality where the client (and thus stock in their custody) is located. */
  client_locality_id: zod.number().int().nullable().optional(),
  client_locality_name: zod.string().nullable().optional(),
  /** Client dispatch territory — used by billing location filters. */
  client_territory_id: zod.number().int().nullable().optional(),
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
  /** Present after successful ARCA FECAE authorization. */
  arca: InvoiceArcaAuthorization.optional(),
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
  /**
   * SALE movements in scope with no `cylinder_sale` price row (cannot bill).
   * Only set on freshly created drafts — not persisted.
   */
  skipped_sales_no_price: zod.number().int().nonnegative().optional(),
  /** Serials for `skipped_sales_no_price` (best-effort, capped). */
  skipped_sales_no_price_serials: zod.array(zod.string()).optional(),
  /**
   * Charge sources skipped because they are already on APPROVED/EXPORTED
   * invoices for the period. Only set on freshly created drafts.
   */
  skipped_already_billed: zod.number().int().nonnegative().optional(),
});
export type BillingRun = zod.infer<typeof BillingRun>;

export const BillingChargeScope = zod.enum(["all", "rentals", "sales"]);
export type BillingChargeScope = zod.infer<typeof BillingChargeScope>;

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
    /**
     * Which commercial charges to include when building the draft:
     * - `all` (default): rentals + refills + accessories + cylinder sales
     * - `rentals`: rental days, refill fills, accessory rentals (no cylinder sales)
     * - `sales`: cylinder sales only
     */
    charges: BillingChargeScope.optional(),
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

/** Load existing invoices for a period (e.g. when create is PERIOD_LOCKED). */
export const PeriodInvoicesQuery = zod.object({
  period_start: IsoDate,
  period_end: IsoDate,
  client_party_id: zod.coerce.number().int().optional(),
  locality_id: zod.coerce.number().int().optional(),
  territory_id: zod.coerce.number().int().optional(),
});
export type PeriodInvoicesQuery = zod.infer<typeof PeriodInvoicesQuery>;

export const PeriodInvoicesResponse = zod.object({
  period_start: IsoDate,
  period_end: IsoDate,
  locked: zod.boolean(),
  invoices: zod.array(Invoice),
});
export type PeriodInvoicesResponse = zod.infer<typeof PeriodInvoicesResponse>;

/** Keep only these charge lines on a DRAFT invoice; others are deferred. */
export const SetInvoiceChargeLinesInput = zod.object({
  charge_line_ids: zod.array(zod.number().int().positive()).min(1),
});
export type SetInvoiceChargeLinesInput = zod.infer<
  typeof SetInvoiceChargeLinesInput
>;

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

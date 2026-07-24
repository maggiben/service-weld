import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { MovementKind } from "./enums";

export const Alert = zod.object({
  id: zod.number().int(),
  alert_type: zod.string(),
  entity_table: zod.string().nullable(),
  entity_id: zod.number().int().nullable(),
  severity: zod.number().int(),
  created_at: zod.string().datetime(),
  resolved_at: zod.string().datetime().nullable(),
  assigned_role: zod.string().nullable(),
  /** Human-readable fallback; UI prefers structured context fields. */
  summary: zod.string().optional(),
  cylinder_id: zod.number().int().nullable().optional(),
  cylinder_serial: zod.string().nullable().optional(),
  client_party_id: zod.number().int().nullable().optional(),
  client_name: zod.string().nullable().optional(),
  counterparty_name: zod.string().nullable().optional(),
  gas_code: zod.string().nullable().optional(),
  days_open: zod.number().int().nullable().optional(),
  loan_stage: zod.string().nullable().optional(),
  /** Present for LONG_OUTSTANDING (movement_event) alerts. */
  movement_kind: MovementKind.nullable().optional(),
  /** Primary client phone when available (call list). */
  client_phone: zod.string().nullable().optional(),
  contact_note: zod.string().nullable().optional(),
  last_contacted_at: zod.string().datetime().nullable().optional(),
});
export type Alert = zod.infer<typeof Alert>;

export const AlertListQuery = PaginationQuery.extend({
  sort: zod.enum(["created_at", "-created_at"]).default("-created_at"),
  open: zod
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  "filter[alert_type]": zod.string().optional(),
  "filter[assigned_role]": zod.string().optional(),
  "filter[movement_kind]": MovementKind.optional(),
});
export type AlertListQuery = zod.infer<typeof AlertListQuery>;

export const AlertListResponse = paginated(Alert);
export type AlertListResponse = zod.infer<typeof AlertListResponse>;

export const RefreshAlertsResult = zod.object({
  created: zod.number().int(),
  open_count: zod.number().int(),
});
export type RefreshAlertsResult = zod.infer<typeof RefreshAlertsResult>;

export const AlertSummary = zod.object({
  open_count: zod.number().int(),
});
export type AlertSummary = zod.infer<typeof AlertSummary>;

/** Optional period: count still-open alerts created in the inclusive date range. */
export const AlertSummaryQuery = zod.object({
  period_start: IsoDate.optional(),
  period_end: IsoDate.optional(),
});
export type AlertSummaryQuery = zod.infer<typeof AlertSummaryQuery>;

/** Register / update customer follow-up on an operational alert. */
export const UpdateAlertContact = zod.object({
  contact_note: zod.string().max(4000).nullable(),
  /** ISO datetime; omit to set "now" on save. Pass null to clear. */
  last_contacted_at: zod.string().datetime().nullable().optional(),
});
export type UpdateAlertContact = zod.infer<typeof UpdateAlertContact>;

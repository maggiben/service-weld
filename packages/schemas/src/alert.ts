import { z } from "zod";
import { paginated, PaginationQuery } from "./common";
import { MovementKind } from "./enums";

export const Alert = z.object({
  id: z.number().int(),
  alert_type: z.string(),
  entity_table: z.string().nullable(),
  entity_id: z.number().int().nullable(),
  severity: z.number().int(),
  created_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable(),
  assigned_role: z.string().nullable(),
  /** Human-readable fallback; UI prefers structured context fields. */
  summary: z.string().optional(),
  cylinder_id: z.number().int().nullable().optional(),
  cylinder_serial: z.string().nullable().optional(),
  client_party_id: z.number().int().nullable().optional(),
  client_name: z.string().nullable().optional(),
  counterparty_name: z.string().nullable().optional(),
  gas_code: z.string().nullable().optional(),
  days_open: z.number().int().nullable().optional(),
  loan_stage: z.string().nullable().optional(),
  /** Present for LONG_OUTSTANDING (movement_event) alerts. */
  movement_kind: MovementKind.nullable().optional(),
  /** Primary client phone when available (call list). */
  client_phone: z.string().nullable().optional(),
  contact_note: z.string().nullable().optional(),
  last_contacted_at: z.string().datetime().nullable().optional(),
});
export type Alert = z.infer<typeof Alert>;

export const AlertListQuery = PaginationQuery.extend({
  sort: z.enum(["created_at", "-created_at"]).default("-created_at"),
  open: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  "filter[alert_type]": z.string().optional(),
  "filter[assigned_role]": z.string().optional(),
  "filter[movement_kind]": MovementKind.optional(),
});
export type AlertListQuery = z.infer<typeof AlertListQuery>;

export const AlertListResponse = paginated(Alert);
export type AlertListResponse = z.infer<typeof AlertListResponse>;

export const RefreshAlertsResult = z.object({
  created: z.number().int(),
  open_count: z.number().int(),
});
export type RefreshAlertsResult = z.infer<typeof RefreshAlertsResult>;

export const AlertSummary = z.object({
  open_count: z.number().int(),
});
export type AlertSummary = z.infer<typeof AlertSummary>;

/** Register / update customer follow-up on an operational alert. */
export const UpdateAlertContact = z.object({
  contact_note: z.string().max(4000).nullable(),
  /** ISO datetime; omit to set "now" on save. Pass null to clear. */
  last_contacted_at: z.string().datetime().nullable().optional(),
});
export type UpdateAlertContact = z.infer<typeof UpdateAlertContact>;

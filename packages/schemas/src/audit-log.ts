import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { AuditAction } from "./enums";

export const AuditLogEntry = z.object({
  id: z.number().int(),
  occurred_at: z.string().datetime(),
  actor_user_id: z.number().int().nullable(),
  actor_username: z.string().nullable(),
  actor_role: z.string().nullable(),
  action: AuditAction,
  entity_table: z.string(),
  entity_id: z.number().int().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  request_id: z.string().nullable(),
  source: z.string().nullable(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;

export const AuditLogListQuery = PaginationQuery.extend({
  sort: z.enum(["occurred_at", "-occurred_at"]).default("-occurred_at"),
  "filter[entity_table]": z.string().optional(),
  "filter[entity_id]": z.coerce.number().int().optional(),
  "filter[actor_user_id]": z.coerce.number().int().optional(),
  "filter[actor_username]": z.string().min(1).optional(),
  "filter[action]": AuditAction.optional(),
  "filter[occurred_at][gte]": IsoDate.optional(),
  "filter[occurred_at][lte]": IsoDate.optional(),
});
export type AuditLogListQuery = z.infer<typeof AuditLogListQuery>;

export const AuditLogListResponse = paginated(AuditLogEntry);
export type AuditLogListResponse = z.infer<typeof AuditLogListResponse>;

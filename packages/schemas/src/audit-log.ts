import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { AuditAction } from "./enums";

export const AuditLogEntry = zod.object({
  id: zod.number().int(),
  occurred_at: zod.string().datetime(),
  actor_user_id: zod.number().int().nullable(),
  actor_username: zod.string().nullable(),
  actor_role: zod.string().nullable(),
  action: AuditAction,
  entity_table: zod.string(),
  entity_id: zod.number().int().nullable(),
  before: zod.unknown().nullable(),
  after: zod.unknown().nullable(),
  request_id: zod.string().nullable(),
  source: zod.string().nullable(),
});
export type AuditLogEntry = zod.infer<typeof AuditLogEntry>;

export const AuditLogListQuery = PaginationQuery.extend({
  sort: zod.enum(["occurred_at", "-occurred_at"]).default("-occurred_at"),
  "filter[entity_table]": zod.string().optional(),
  "filter[entity_id]": zod.coerce.number().int().optional(),
  "filter[actor_user_id]": zod.coerce.number().int().optional(),
  "filter[actor_username]": zod.string().min(1).optional(),
  "filter[action]": AuditAction.optional(),
  "filter[occurred_at][gte]": IsoDate.optional(),
  "filter[occurred_at][lte]": IsoDate.optional(),
});
export type AuditLogListQuery = zod.infer<typeof AuditLogListQuery>;

export const AuditLogListResponse = paginated(AuditLogEntry);
export type AuditLogListResponse = zod.infer<typeof AuditLogListResponse>;

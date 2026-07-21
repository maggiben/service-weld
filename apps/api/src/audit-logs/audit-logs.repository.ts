import { Inject, Injectable } from "@nestjs/common";
import type {
  AuditAction,
  AuditLogEntry,
  AuditLogListQuery,
} from "@weld/schemas";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import type { AuditActionDb } from "../database/schema.types";

interface AuditRow {
  id: number | string | bigint;
  occurred_at: Date;
  actor_user_id: number | string | bigint | null;
  actor_username: string | null;
  actor_role: string | null;
  action: AuditActionDb;
  entity_table: string;
  entity_id: number | string | bigint | null;
  before: unknown | null;
  after: unknown | null;
  request_id: string | null;
  source: string | null;
}

function mapEntry(row: AuditRow): AuditLogEntry {
  return {
    id: Number(row.id),
    occurred_at: row.occurred_at.toISOString(),
    actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actor_username: row.actor_username,
    actor_role: row.actor_role,
    action: row.action as AuditAction,
    entity_table: row.entity_table,
    entity_id: row.entity_id == null ? null : Number(row.entity_id),
    before: row.before,
    after: row.after,
    request_id: row.request_id,
    source: row.source,
  };
}

@Injectable()
export class AuditLogsRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: AuditLogListQuery): Promise<{
    data: AuditLogEntry[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["occurred_at"], "occurred_at");

    let qb = db
      .selectFrom("audit_log")
      .leftJoin("app_user", "app_user.id", "audit_log.actor_user_id")
      .select([
        "audit_log.id",
        "audit_log.occurred_at",
        "audit_log.actor_user_id",
        "app_user.username as actor_username",
        "audit_log.actor_role",
        "audit_log.action",
        "audit_log.entity_table",
        "audit_log.entity_id",
        "audit_log.before",
        "audit_log.after",
        "audit_log.request_id",
        "audit_log.source",
      ]);

    if (query["filter[entity_table]"]) {
      qb = qb.where(
        "audit_log.entity_table",
        "=",
        query["filter[entity_table]"],
      );
    }
    if (query["filter[entity_id]"] != null) {
      qb = qb.where("audit_log.entity_id", "=", query["filter[entity_id]"]);
    }
    if (query["filter[actor_user_id]"] != null) {
      qb = qb.where(
        "audit_log.actor_user_id",
        "=",
        query["filter[actor_user_id]"],
      );
    }
    if (query["filter[actor_username]"]) {
      const username = query["filter[actor_username]"].trim();
      if (username) {
        qb = qb.where("app_user.username", "ilike", `%${username}%`);
      }
    }
    if (query["filter[action]"]) {
      qb = qb.where("audit_log.action", "=", query["filter[action]"]);
    }
    if (query["filter[occurred_at][gte]"]) {
      qb = qb.where(
        "audit_log.occurred_at",
        ">=",
        new Date(`${query["filter[occurred_at][gte]"]}T00:00:00.000Z`),
      );
    }
    if (query["filter[occurred_at][lte]"]) {
      qb = qb.where(
        "audit_log.occurred_at",
        "<=",
        new Date(`${query["filter[occurred_at][lte]"]}T23:59:59.999Z`),
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorAt = new Date(String(cursor.occurred_at ?? 0));
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("audit_log.occurred_at", ">", cursorAt),
                eb.and([
                  eb("audit_log.occurred_at", "=", cursorAt),
                  eb("audit_log.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("audit_log.occurred_at", "<", cursorAt),
                eb.and([
                  eb("audit_log.occurred_at", "=", cursorAt),
                  eb("audit_log.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = (await qb
      .orderBy("audit_log.occurred_at", sort.direction)
      .orderBy("audit_log.id", sort.direction)
      .limit(limit + 1)
      .execute()) as AuditRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map(mapEntry),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                occurred_at: last.occurred_at.toISOString(),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }
}

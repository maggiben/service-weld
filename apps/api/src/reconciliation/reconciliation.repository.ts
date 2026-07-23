import { Inject, Injectable } from "@nestjs/common";
import {
  absentHereRow,
  businessTodayIso,
  calendarDaysBetween,
  classifyPhysicalCountRow,
  isToVerifyNote,
} from "@weld/domain";
import type {
  OutstandingListQuery,
  OutstandingRow,
  PhysicalCountInput,
  PhysicalCountResult,
  ReconciliationVarianceRow,
} from "@weld/schemas";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import type { CylinderState } from "../database/schema.types";
import { resolveDb } from "../database/transaction.context";

@Injectable()
export class ReconciliationRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async listOutstanding(query: OutstandingListQuery): Promise<{
    data: OutstandingRow[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["accrued_days", "delivery_date"]);
    const asOf = query.as_of ?? businessTodayIso();

    let qb = db
      .selectFrom("movement_event")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .select([
        "movement_event.id as movement_id",
        "movement_event.cylinder_id",
        "cylinder.serial_number",
        "cylinder.state as cylinder_state",
        "movement_event.holder_party_id as client_party_id",
        "party.display_name as client_name",
        "movement_event.gas_code",
        "movement_event.delivery_date",
        "movement_event.note",
      ])
      .where("movement_event.state", "=", "OPEN")
      .where("movement_event.return_date", "is", null);

    if (query["filter[client_party_id]"] != null) {
      qb = qb.where(
        "movement_event.holder_party_id",
        "=",
        query["filter[client_party_id]"],
      );
    }

    // Fetch a wider page then filter min_days in memory for accrued_days cursor.
    const rows = await qb
      .orderBy("movement_event.delivery_date", "asc")
      .orderBy("movement_event.id", "asc")
      .execute();

    let mapped: OutstandingRow[] = rows.map((row) => {
      const delivery =
        typeof row.delivery_date === "string"
          ? row.delivery_date.slice(0, 10)
          : (row.delivery_date as Date).toISOString().slice(0, 10);
      return {
        movement_id: Number(row.movement_id),
        cylinder_id: Number(row.cylinder_id),
        serial_number: row.serial_number,
        client_party_id: Number(row.client_party_id),
        client_name: row.client_name,
        gas_code: row.gas_code as OutstandingRow["gas_code"],
        delivery_date: delivery,
        accrued_days: calendarDaysBetween(delivery, asOf),
        to_verify: isToVerifyNote(row.note),
        cylinder_state: row.cylinder_state as OutstandingRow["cylinder_state"],
      };
    });

    if (query.min_days != null) {
      mapped = mapped.filter((r) => r.accrued_days >= query.min_days!);
    }

    mapped.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      if (sort.field === "delivery_date") {
        return a.delivery_date.localeCompare(b.delivery_date) * dir;
      }
      return (a.accrued_days - b.accrued_days) * dir;
    });

    let start = 0;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorId = Number(cursor.movement_id ?? 0);
      start = mapped.findIndex((r) => r.movement_id === cursorId) + 1;
      if (start < 0) start = 0;
    }

    const pageRows = mapped.slice(start, start + limit + 1);
    const hasMore = pageRows.length > limit;
    const data = hasMore ? pageRows.slice(0, limit) : pageRows;
    const last = data[data.length - 1];

    return {
      data,
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ movement_id: last.movement_id })
            : null,
      }),
    };
  }

  async runPhysicalCount(
    input: PhysicalCountInput,
  ): Promise<PhysicalCountResult> {
    const db = resolveDb(this.db);

    const serials = [
      ...new Set(input.serial_numbers.map((s) => s.trim()).filter(Boolean)),
    ];
    const ids = [...new Set(input.cylinder_ids)];

    const byId =
      ids.length > 0
        ? await db
            .selectFrom("cylinder")
            .select(["id", "serial_number", "state"])
            .where("id", "in", ids)
            .where("deleted_at", "is", null)
            .execute()
        : [];

    for (const row of byId) {
      serials.push(row.serial_number);
    }
    const uniqueSerials = [...new Set(serials)];

    const systemRows =
      uniqueSerials.length > 0
        ? await db
            .selectFrom("cylinder")
            .select(["id", "serial_number", "state"])
            .where("serial_number", "in", uniqueSerials)
            .where("deleted_at", "is", null)
            .execute()
        : [];

    // Prefer exact serial match; if duplicates exist, take first (legacy ambiguity).
    const bySerial = new Map<
      string,
      { cylinderId: number; state: CylinderState; serial: string }
    >();
    for (const row of systemRows) {
      if (!bySerial.has(row.serial_number)) {
        bySerial.set(row.serial_number, {
          cylinderId: Number(row.id),
          state: row.state,
          serial: row.serial_number,
        });
      }
    }

    const countedIds = new Set<number>();
    const rows: ReconciliationVarianceRow[] = [];

    for (const serial of uniqueSerials) {
      const system = bySerial.get(serial) ?? null;
      const classified = classifyPhysicalCountRow({
        serial,
        system: system
          ? { cylinderId: system.cylinderId, state: system.state }
          : null,
      });
      if (classified.cylinder_id != null)
        countedIds.add(classified.cylinder_id);
      rows.push(classified);
    }

    // Only when the operator asserts a complete plant inventory: every
    // in-stock cylinder missing from the list is a potential loss.
    if (input.full_plant_count) {
      const inStock = await db
        .selectFrom("cylinder")
        .select(["id", "serial_number", "state"])
        .where("state", "in", ["IN_STOCK_EMPTY", "IN_STOCK_FULL"])
        .where("deleted_at", "is", null)
        .execute();

      for (const cyl of inStock) {
        const id = Number(cyl.id);
        if (countedIds.has(id)) continue;
        // Also skip if serial was counted (matched via serial list)
        if (uniqueSerials.includes(cyl.serial_number)) continue;
        rows.push(
          absentHereRow({
            cylinderId: id,
            serial: cyl.serial_number,
            state: cyl.state,
          }),
        );
      }
    }

    const holderIds = [
      ...new Set(
        rows
          .filter(
            (r) =>
              r.cylinder_id != null &&
              (r.system_state === "AT_CLIENT" ||
                r.system_state === "AT_SUPPLIER"),
          )
          .map((r) => r.cylinder_id!),
      ),
    ];
    if (holderIds.length > 0) {
      const holders = await db
        .selectFrom("movement_event")
        .innerJoin("party", "party.id", "movement_event.holder_party_id")
        .select([
          "movement_event.cylinder_id",
          "party.display_name as holder_name",
        ])
        .where("movement_event.state", "=", "OPEN")
        .where("movement_event.return_date", "is", null)
        .where("movement_event.cylinder_id", "in", holderIds)
        .execute();
      const holderByCylinder = new Map<number, string>();
      for (const h of holders) {
        const id = Number(h.cylinder_id);
        if (!holderByCylinder.has(id)) {
          holderByCylinder.set(id, h.holder_name);
        }
      }
      for (const row of rows) {
        if (row.cylinder_id == null) continue;
        const name = holderByCylinder.get(row.cylinder_id);
        if (name) row.holder_name = name;
      }
    }

    const matched = rows.filter((r) => r.kind === "MATCHED").length;
    const present_elsewhere = rows.filter(
      (r) => r.kind === "PRESENT_ELSEWHERE",
    ).length;
    const absent_here = rows.filter((r) => r.kind === "ABSENT_HERE").length;
    const unknown_serial = rows.filter(
      (r) => r.kind === "UNKNOWN_SERIAL",
    ).length;

    return {
      counted_on: input.counted_on,
      counted: uniqueSerials.length,
      matched,
      present_elsewhere,
      absent_here,
      unknown_serial,
      rows,
    };
  }
}

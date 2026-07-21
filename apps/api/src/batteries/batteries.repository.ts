import { Inject, Injectable } from "@nestjs/common";
import type {
  Battery,
  BatteryListQuery,
  BatteryMember,
  CreateBatteryInput,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import type { CylinderState } from "../database/schema.types";

interface BatteryRow {
  id: number;
  battery_code: string;
  owner_party_id: number;
  owner_name: string;
  gas_code: string | null;
  member_count: number | null;
  state: CylinderState;
  version: number;
  created_at: Date;
}

function mapBattery(row: BatteryRow, members?: BatteryMember[]): Battery {
  return {
    id: Number(row.id),
    battery_code: row.battery_code,
    owner_party_id: Number(row.owner_party_id),
    owner_name: row.owner_name,
    gas_code: row.gas_code as Battery["gas_code"],
    member_count: row.member_count == null ? null : Number(row.member_count),
    state: row.state,
    version: Number(row.version),
    created_at: row.created_at.toISOString(),
    members,
  };
}

@Injectable()
export class BatteriesRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: BatteryListQuery): Promise<{
    data: Battery[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["battery_code"]);

    let qb = db
      .selectFrom("cylinder_battery")
      .innerJoin("party", "party.id", "cylinder_battery.owner_party_id")
      .select([
        "cylinder_battery.id",
        "cylinder_battery.battery_code",
        "cylinder_battery.owner_party_id",
        "party.display_name as owner_name",
        "cylinder_battery.gas_code",
        "cylinder_battery.member_count",
        "cylinder_battery.state",
        "cylinder_battery.version",
        "cylinder_battery.created_at",
      ])
      .where("cylinder_battery.deleted_at", "is", null);

    if (query.q) {
      qb = qb.where("cylinder_battery.battery_code", "ilike", `%${query.q}%`);
    }
    if (query["filter[state]"]) {
      qb = qb.where("cylinder_battery.state", "=", query["filter[state]"]);
    }
    if (query["filter[gas_code]"]) {
      qb = qb.where(
        "cylinder_battery.gas_code",
        "=",
        query["filter[gas_code]"],
      );
    }
    if (query["filter[owner_party_id]"] != null) {
      qb = qb.where(
        "cylinder_battery.owner_party_id",
        "=",
        query["filter[owner_party_id]"],
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorCode = String(cursor.battery_code ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("cylinder_battery.battery_code", ">", cursorCode),
                eb.and([
                  eb("cylinder_battery.battery_code", "=", cursorCode),
                  eb("cylinder_battery.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("cylinder_battery.battery_code", "<", cursorCode),
                eb.and([
                  eb("cylinder_battery.battery_code", "=", cursorCode),
                  eb("cylinder_battery.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = (await qb
      .orderBy("cylinder_battery.battery_code", sort.direction)
      .orderBy("cylinder_battery.id", sort.direction)
      .limit(limit + 1)
      .execute()) as BatteryRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) => mapBattery(row)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                battery_code: last.battery_code,
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getById(id: number): Promise<Battery | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("cylinder_battery")
      .innerJoin("party", "party.id", "cylinder_battery.owner_party_id")
      .select([
        "cylinder_battery.id",
        "cylinder_battery.battery_code",
        "cylinder_battery.owner_party_id",
        "party.display_name as owner_name",
        "cylinder_battery.gas_code",
        "cylinder_battery.member_count",
        "cylinder_battery.state",
        "cylinder_battery.version",
        "cylinder_battery.created_at",
      ])
      .where("cylinder_battery.id", "=", id)
      .where("cylinder_battery.deleted_at", "is", null)
      .executeTakeFirst()) as BatteryRow | undefined;

    if (!row) return null;
    const members = await this.listActiveMembers(id);
    return mapBattery(row, members);
  }

  async listActiveMembers(batteryId: number): Promise<BatteryMember[]> {
    const db = resolveDb(this.db);
    const rows = await db
      .selectFrom("battery_member")
      .innerJoin("cylinder", "cylinder.id", "battery_member.cylinder_id")
      .select([
        "battery_member.cylinder_id",
        "cylinder.serial_number",
        "cylinder.gas_code",
        "cylinder.state",
        "battery_member.added_at",
        "battery_member.removed_at",
      ])
      .where("battery_member.battery_id", "=", batteryId)
      .where("battery_member.removed_at", "is", null)
      .execute();

    return rows.map((row) => ({
      cylinder_id: Number(row.cylinder_id),
      serial_number: row.serial_number,
      gas_code: row.gas_code as BatteryMember["gas_code"],
      state: row.state,
      added_at: (row.added_at as Date).toISOString(),
      removed_at: row.removed_at
        ? (row.removed_at as Date).toISOString()
        : null,
    }));
  }

  async getCylinderPackInfo(cylinderId: number): Promise<{
    id: number;
    owner_party_id: number;
    packaging: "SINGLE" | "BATTERY" | "BATTERY_MEMBER";
    battery_id: number | null;
    state: CylinderState;
    gas_code: string | null;
  } | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("cylinder")
      .select([
        "id",
        "owner_party_id",
        "packaging",
        "battery_id",
        "state",
        "gas_code",
      ])
      .where("id", "=", cylinderId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row
      ? {
          id: Number(row.id),
          owner_party_id: Number(row.owner_party_id),
          packaging: row.packaging,
          battery_id: row.battery_id == null ? null : Number(row.battery_id),
          state: row.state,
          gas_code: row.gas_code,
        }
      : null;
  }

  async create(
    input: CreateBatteryInput,
    actorUserId: number,
  ): Promise<Battery> {
    const db = resolveDb(this.db);

    const inserted = await db
      .insertInto("cylinder_battery")
      .values({
        battery_code: input.battery_code,
        owner_party_id: input.owner_party_id,
        gas_code: input.gas_code ?? null,
        member_count: input.member_cylinder_ids.length,
        state: "IN_STOCK_EMPTY",
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const batteryId = Number(inserted.id);

    for (const cylinderId of input.member_cylinder_ids) {
      await db
        .insertInto("battery_member")
        .values({
          battery_id: batteryId,
          cylinder_id: cylinderId,
        })
        .execute();

      await db
        .updateTable("cylinder")
        .set({
          packaging: "BATTERY_MEMBER",
          battery_id: batteryId,
          updated_by: actorUserId,
        })
        .where("id", "=", cylinderId)
        .execute();
    }

    const created = await this.getById(batteryId);
    if (!created) throw ApiErrors.notFound("Battery not found after create");
    return created;
  }

  async addMember(
    batteryId: number,
    cylinderId: number,
    actorUserId: number,
  ): Promise<Battery> {
    const db = resolveDb(this.db);

    await db
      .insertInto("battery_member")
      .values({ battery_id: batteryId, cylinder_id: cylinderId })
      .execute();

    await db
      .updateTable("cylinder")
      .set({
        packaging: "BATTERY_MEMBER",
        battery_id: batteryId,
        updated_by: actorUserId,
      })
      .where("id", "=", cylinderId)
      .execute();

    const members = await this.listActiveMembers(batteryId);
    await db
      .updateTable("cylinder_battery")
      .set({
        member_count: members.length,
        updated_by: actorUserId,
      })
      .where("id", "=", batteryId)
      .execute();

    const battery = await this.getById(batteryId);
    if (!battery) throw ApiErrors.notFound("Battery not found");
    return battery;
  }

  async removeMember(
    batteryId: number,
    cylinderId: number,
    actorUserId: number,
  ): Promise<Battery> {
    const db = resolveDb(this.db);

    const updated = await db
      .updateTable("battery_member")
      .set({ removed_at: new Date() })
      .where("battery_id", "=", batteryId)
      .where("cylinder_id", "=", cylinderId)
      .where("removed_at", "is", null)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.notFound("Battery member not found");
    }

    await db
      .updateTable("cylinder")
      .set({
        packaging: "SINGLE",
        battery_id: null,
        updated_by: actorUserId,
      })
      .where("id", "=", cylinderId)
      .execute();

    const members = await this.listActiveMembers(batteryId);
    await db
      .updateTable("cylinder_battery")
      .set({
        member_count: members.length,
        updated_by: actorUserId,
      })
      .where("id", "=", batteryId)
      .execute();

    const battery = await this.getById(batteryId);
    if (!battery) throw ApiErrors.notFound("Battery not found");
    return battery;
  }
}

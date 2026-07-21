import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateCylinderInput,
  Cylinder,
  CylinderHistoryQuery,
  CylinderHistoryResponse,
  CylinderHistoryRow,
  CylinderListQuery,
} from "@weld/schemas";
import { sql } from "kysely";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import type {
  CylinderCondition,
  CylinderState,
  MovementState,
  OwnershipBasis,
  PackagingKind,
  PartyType,
} from "../database/schema.types";

interface CylinderRow {
  id: number;
  owner_party_id: number;
  owner_name: string;
  serial_number: string;
  gas_code: string | null;
  capacity_m3: string | null;
  ownership_basis: OwnershipBasis;
  packaging: PackagingKind;
  battery_id: number | null;
  home_territory_id: number | null;
  state: CylinderState;
  condition: CylinderCondition;
  acquisition_date: string | Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  current_holder_party_id: number | null;
  current_holder_name: string | null;
  current_movement_id: number | null;
  current_location_name: string | null;
}

/** Client locality/territory when out; home depot name when in stock. */
const currentLocationNameSelect = sql<string | null>`
  coalesce(
    (
      select coalesce(loc_locality.name, loc_territory.name)
      from movement_event as loc_move
      inner join client as loc_client
        on loc_client.party_id = loc_move.holder_party_id
      left join locality as loc_locality
        on loc_locality.id = loc_client.locality_id
      left join dispatch_territory as loc_territory
        on loc_territory.id = loc_client.territory_id
      where loc_move.cylinder_id = cylinder.id
        and loc_move.state = 'OPEN'
        and loc_move.return_date is null
      limit 1
    ),
    (
      select home_t.name
      from dispatch_territory as home_t
      where home_t.id = cylinder.home_territory_id
        and cylinder.state in ('IN_STOCK_EMPTY', 'IN_STOCK_FULL')
      limit 1
    )
  )
`.as("current_location_name");

function toIsoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapCylinder(row: CylinderRow): Cylinder {
  return {
    id: Number(row.id),
    owner_party_id: Number(row.owner_party_id),
    owner_name: row.owner_name,
    serial_number: row.serial_number,
    gas_code: row.gas_code as Cylinder["gas_code"],
    capacity_m3: row.capacity_m3 == null ? null : Number(row.capacity_m3),
    ownership_basis: row.ownership_basis,
    packaging: row.packaging,
    battery_id: row.battery_id == null ? null : Number(row.battery_id),
    home_territory_id:
      row.home_territory_id == null ? null : Number(row.home_territory_id),
    state: row.state,
    condition: row.condition,
    acquisition_date: toIsoDate(row.acquisition_date),
    version: row.version,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    current_holder_party_id:
      row.current_holder_party_id == null
        ? null
        : Number(row.current_holder_party_id),
    current_holder_name: row.current_holder_name ?? null,
    current_movement_id:
      row.current_movement_id == null ? null : Number(row.current_movement_id),
    current_location_name: row.current_location_name ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

@Injectable()
export class CylindersRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: CylinderListQuery): Promise<{
    data: Cylinder[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, [
      "serial_number",
      "updated_at",
      "state",
    ]);

    let qb = db
      .selectFrom("cylinder")
      .innerJoin("party", "party.id", "cylinder.owner_party_id")
      .select([
        "cylinder.id",
        "cylinder.owner_party_id",
        "party.display_name as owner_name",
        "cylinder.serial_number",
        "cylinder.gas_code",
        "cylinder.capacity_m3",
        "cylinder.ownership_basis",
        "cylinder.packaging",
        "cylinder.battery_id",
        "cylinder.home_territory_id",
        "cylinder.state",
        "cylinder.condition",
        "cylinder.acquisition_date",
        "cylinder.version",
        "cylinder.created_at",
        "cylinder.updated_at",
      ])
      .select((eb) =>
        eb
          .selectFrom("movement_event as open_move")
          .select("open_move.holder_party_id")
          .whereRef("open_move.cylinder_id", "=", "cylinder.id")
          .where("open_move.state", "=", "OPEN")
          .where("open_move.return_date", "is", null)
          .limit(1)
          .as("current_holder_party_id"),
      )
      .select((eb) =>
        eb
          .selectFrom("movement_event as open_move")
          .innerJoin(
            "party as holder",
            "holder.id",
            "open_move.holder_party_id",
          )
          .select("holder.display_name")
          .whereRef("open_move.cylinder_id", "=", "cylinder.id")
          .where("open_move.state", "=", "OPEN")
          .where("open_move.return_date", "is", null)
          .limit(1)
          .as("current_holder_name"),
      )
      .select((eb) =>
        eb
          .selectFrom("movement_event as open_move")
          .select("open_move.id")
          .whereRef("open_move.cylinder_id", "=", "cylinder.id")
          .where("open_move.state", "=", "OPEN")
          .where("open_move.return_date", "is", null)
          .limit(1)
          .as("current_movement_id"),
      )
      .select(currentLocationNameSelect)
      .where("cylinder.deleted_at", "is", null);

    if (query.q) {
      qb = qb.where("cylinder.serial_number", "ilike", `%${query.q}%`);
    }
    if (query["filter[state]"]) {
      qb = qb.where("cylinder.state", "=", query["filter[state]"]);
    }
    if (query["filter[gas_code]"]) {
      qb = qb.where("cylinder.gas_code", "=", query["filter[gas_code]"]);
    }
    if (query["filter[owner_party_id]"] != null) {
      qb = qb.where(
        "cylinder.owner_party_id",
        "=",
        query["filter[owner_party_id]"],
      );
    }
    if (query["filter[ownership_basis]"]) {
      qb = qb.where(
        "cylinder.ownership_basis",
        "=",
        query["filter[ownership_basis]"],
      );
    }
    if (query["filter[territory_id]"] != null) {
      // Current location: at a client in the territory, or in-stock at that depot.
      const territoryId = query["filter[territory_id]"];
      qb = qb.where((eb) =>
        eb.or([
          eb.and([
            eb("cylinder.state", "in", ["IN_STOCK_EMPTY", "IN_STOCK_FULL"]),
            eb("cylinder.home_territory_id", "=", territoryId),
          ]),
          eb(
            "cylinder.id",
            "in",
            eb
              .selectFrom("movement_event as loc_move")
              .innerJoin(
                "client as loc_client",
                "loc_client.party_id",
                "loc_move.holder_party_id",
              )
              .select("loc_move.cylinder_id")
              .where("loc_move.state", "=", "OPEN")
              .where("loc_move.return_date", "is", null)
              .where("loc_client.territory_id", "=", territoryId),
          ),
        ]),
      );
    }
    if (query["filter[locality_id]"] != null) {
      const localityId = query["filter[locality_id]"];
      qb = qb.where((eb) =>
        eb(
          "cylinder.id",
          "in",
          eb
            .selectFrom("movement_event as city_move")
            .innerJoin(
              "client as city_client",
              "city_client.party_id",
              "city_move.holder_party_id",
            )
            .select("city_move.cylinder_id")
            .where("city_move.state", "=", "OPEN")
            .where("city_move.return_date", "is", null)
            .where("city_client.locality_id", "=", localityId),
        ),
      );
    }
    if (query["filter[packaging]"]) {
      qb = qb.where("cylinder.packaging", "=", query["filter[packaging]"]);
    }
    if (query["filter[available_for_rental]"]) {
      // Deliverable rental stock only — never cylinders already with a client.
      qb = qb
        .where("cylinder.state", "in", ["IN_STOCK_EMPTY", "IN_STOCK_FULL"])
        .where("cylinder.ownership_basis", "in", ["OURS", "SUPPLIER"])
        .where("cylinder.packaging", "!=", "BATTERY_MEMBER")
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("movement_event as open_rent")
                .select("open_rent.id")
                .whereRef("open_rent.cylinder_id", "=", "cylinder.id")
                .where("open_rent.state", "=", "OPEN")
                .where("open_rent.return_date", "is", null),
            ),
          ),
        );
    }

    if (query.cursor && sort.field === "serial_number") {
      const cursor = decodeCursor(query.cursor);
      const cursorSerial = String(cursor.serial_number ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("cylinder.serial_number", ">", cursorSerial),
                eb.and([
                  eb("cylinder.serial_number", "=", cursorSerial),
                  eb("cylinder.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("cylinder.serial_number", "<", cursorSerial),
                eb.and([
                  eb("cylinder.serial_number", "=", cursorSerial),
                  eb("cylinder.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const sortColumn =
      sort.field === "updated_at"
        ? "cylinder.updated_at"
        : sort.field === "state"
          ? "cylinder.state"
          : "cylinder.serial_number";

    const rows = (await qb
      .orderBy(sortColumn, sort.direction)
      .orderBy("cylinder.id", sort.direction)
      .limit(limit + 1)
      .execute()) as CylinderRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map(mapCylinder),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                serial_number: last.serial_number,
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getById(id: number): Promise<Cylinder | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("cylinder")
      .innerJoin("party", "party.id", "cylinder.owner_party_id")
      .select([
        "cylinder.id",
        "cylinder.owner_party_id",
        "party.display_name as owner_name",
        "cylinder.serial_number",
        "cylinder.gas_code",
        "cylinder.capacity_m3",
        "cylinder.ownership_basis",
        "cylinder.packaging",
        "cylinder.battery_id",
        "cylinder.home_territory_id",
        "cylinder.state",
        "cylinder.condition",
        "cylinder.acquisition_date",
        "cylinder.version",
        "cylinder.created_at",
        "cylinder.updated_at",
      ])
      .select((eb) =>
        eb
          .selectFrom("movement_event as open_move")
          .select("open_move.holder_party_id")
          .whereRef("open_move.cylinder_id", "=", "cylinder.id")
          .where("open_move.state", "=", "OPEN")
          .where("open_move.return_date", "is", null)
          .limit(1)
          .as("current_holder_party_id"),
      )
      .select((eb) =>
        eb
          .selectFrom("movement_event as open_move")
          .innerJoin(
            "party as holder",
            "holder.id",
            "open_move.holder_party_id",
          )
          .select("holder.display_name")
          .whereRef("open_move.cylinder_id", "=", "cylinder.id")
          .where("open_move.state", "=", "OPEN")
          .where("open_move.return_date", "is", null)
          .limit(1)
          .as("current_holder_name"),
      )
      .select((eb) =>
        eb
          .selectFrom("movement_event as open_move")
          .select("open_move.id")
          .whereRef("open_move.cylinder_id", "=", "cylinder.id")
          .where("open_move.state", "=", "OPEN")
          .where("open_move.return_date", "is", null)
          .limit(1)
          .as("current_movement_id"),
      )
      .select(currentLocationNameSelect)
      .where("cylinder.id", "=", id)
      .where("cylinder.deleted_at", "is", null)
      .executeTakeFirst()) as CylinderRow | undefined;

    return row ? mapCylinder(row) : null;
  }

  async listHistory(
    cylinderId: number,
    query: CylinderHistoryQuery,
  ): Promise<CylinderHistoryResponse | null> {
    const cylinder = await this.getById(cylinderId);
    if (!cylinder) return null;

    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["delivery_date"]);
    const gte = query["filter[delivery_date][gte]"];
    const lte = query["filter[delivery_date][lte]"];
    const holderPartyId = query["filter[holder_party_id]"];

    let movementsQb = db
      .selectFrom("movement_event")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .select([
        "movement_event.id as movement_id",
        "movement_event.holder_party_id",
        "party.display_name as holder_name",
        "movement_event.gas_code",
        "movement_event.movement_kind",
        "movement_event.delivery_date",
        "movement_event.return_date",
        "movement_event.rental_days",
        "movement_event.state",
        "movement_event.note",
      ])
      .where("movement_event.cylinder_id", "=", cylinderId);

    if (gte) {
      movementsQb = movementsQb.where(
        "movement_event.delivery_date",
        ">=",
        gte,
      );
    }
    if (lte) {
      movementsQb = movementsQb.where(
        "movement_event.delivery_date",
        "<=",
        lte,
      );
    }
    if (holderPartyId != null) {
      movementsQb = movementsQb.where(
        "movement_event.holder_party_id",
        "=",
        holderPartyId,
      );
    }

    let loansQb = db
      .selectFrom("supplier_loan_cycle")
      .innerJoin("party", "party.id", "supplier_loan_cycle.supplier_party_id")
      .select([
        "supplier_loan_cycle.id as loan_id",
        "supplier_loan_cycle.supplier_party_id as holder_party_id",
        "party.display_name as holder_name",
        "supplier_loan_cycle.gas_code",
        "supplier_loan_cycle.received_from_supplier as delivery_date",
        "supplier_loan_cycle.returned_to_supplier as return_date",
      ])
      .where("supplier_loan_cycle.cylinder_id", "=", cylinderId)
      .where("supplier_loan_cycle.received_from_supplier", "is not", null);

    if (gte) {
      loansQb = loansQb.where(
        "supplier_loan_cycle.received_from_supplier",
        ">=",
        gte,
      );
    }
    if (lte) {
      loansQb = loansQb.where(
        "supplier_loan_cycle.received_from_supplier",
        "<=",
        lte,
      );
    }
    if (holderPartyId != null) {
      loansQb = loansQb.where(
        "supplier_loan_cycle.supplier_party_id",
        "=",
        holderPartyId,
      );
    }

    const [movementRows, loanRows] = await Promise.all([
      movementsQb.execute(),
      loansQb.execute(),
    ]);

    const merged: CylinderHistoryRow[] = [
      ...movementRows.map((row) => ({
        event_source: "MOVEMENT" as const,
        movement_id: Number(row.movement_id),
        loan_id: null,
        holder_party_id: Number(row.holder_party_id),
        holder_name: row.holder_name,
        gas_code: row.gas_code as CylinderHistoryRow["gas_code"],
        movement_kind: row.movement_kind as CylinderHistoryRow["movement_kind"],
        delivery_date: toIsoDate(row.delivery_date)!,
        return_date: toIsoDate(row.return_date),
        rental_days: row.rental_days == null ? null : Number(row.rental_days),
        state: row.state as MovementState,
        note: row.note,
      })),
      ...loanRows.map((row) => {
        const returnDate = toIsoDate(row.return_date);
        return {
          event_source: "SUPPLIER_LOAN" as const,
          movement_id: null,
          loan_id: Number(row.loan_id),
          holder_party_id: Number(row.holder_party_id),
          holder_name: row.holder_name,
          gas_code: row.gas_code as CylinderHistoryRow["gas_code"],
          movement_kind: "SUPPLIER_LOAN" as const,
          delivery_date: toIsoDate(row.delivery_date)!,
          return_date: returnDate,
          rental_days: null,
          state: (returnDate != null ? "CLOSED" : "OPEN") as MovementState,
          note: null,
        };
      }),
    ];

    const direction = sort.direction;
    merged.sort((a, b) => {
      const dateCmp = a.delivery_date.localeCompare(b.delivery_date);
      if (dateCmp !== 0) return direction === "asc" ? dateCmp : -dateCmp;
      const aId = a.movement_id ?? a.loan_id ?? 0;
      const bId = b.movement_id ?? b.loan_id ?? 0;
      const sourceCmp = a.event_source.localeCompare(b.event_source);
      if (sourceCmp !== 0) return direction === "asc" ? sourceCmp : -sourceCmp;
      return direction === "asc" ? aId - bId : bId - aId;
    });

    let filtered = merged;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = String(cursor.delivery_date ?? "");
      const cursorId = Number(cursor.id ?? 0);
      const cursorSource = String(cursor.event_source ?? "MOVEMENT");
      filtered = merged.filter((row) => {
        const rowId = row.movement_id ?? row.loan_id ?? 0;
        if (direction === "asc") {
          if (row.delivery_date > cursorDate) return true;
          if (row.delivery_date < cursorDate) return false;
          if (row.event_source > cursorSource) return true;
          if (row.event_source < cursorSource) return false;
          return rowId > cursorId;
        }
        if (row.delivery_date < cursorDate) return true;
        if (row.delivery_date > cursorDate) return false;
        if (row.event_source < cursorSource) return true;
        if (row.event_source > cursorSource) return false;
        return rowId < cursorId;
      });
    }

    const hasMore = filtered.length > limit;
    const pageRows = hasMore ? filtered.slice(0, limit) : filtered;
    const last = pageRows[pageRows.length - 1];

    return {
      cylinder_id: cylinderId,
      data: pageRows,
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                delivery_date: last.delivery_date,
                id: last.movement_id ?? last.loan_id,
                event_source: last.event_source,
              })
            : null,
      }),
    };
  }

  async getOwnerPartyType(ownerPartyId: number): Promise<PartyType | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("party")
      .select(["party_type"])
      .where("id", "=", ownerPartyId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row?.party_type ?? null;
  }

  async gasExists(code: string): Promise<boolean> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("gas_type")
      .select("code")
      .where("code", "=", code)
      .where("is_active", "=", true)
      .executeTakeFirst();
    return Boolean(row);
  }

  async create(
    input: CreateCylinderInput,
    actorUserId: number,
  ): Promise<Cylinder> {
    const db = resolveDb(this.db);
    try {
      const inserted = await db
        .insertInto("cylinder")
        .values({
          owner_party_id: input.owner_party_id,
          serial_number: input.serial_number,
          gas_code: input.gas_code ?? null,
          capacity_m3:
            input.capacity_m3 == null ? null : String(input.capacity_m3),
          ownership_basis: input.ownership_basis,
          packaging: input.packaging,
          home_territory_id: input.home_territory_id ?? null,
          acquisition_date: input.acquisition_date ?? null,
          condition: input.condition,
          state:
            input.condition === "FULL" ? "IN_STOCK_FULL" : "IN_STOCK_EMPTY",
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const created = await this.getById(Number(inserted.id));
      if (!created) throw ApiErrors.notFound("Cylinder not found after create");
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.duplicateSerial();
      }
      throw error;
    }
  }

  async updateState(
    id: number,
    state: CylinderState,
    condition: CylinderCondition,
    actorUserId: number,
  ): Promise<void> {
    const db = resolveDb(this.db);
    await db
      .updateTable("cylinder")
      .set({
        state,
        condition,
        updated_by: actorUserId,
      })
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .execute();
  }

  async reportLoss(params: {
    cylinderId: number;
    outcome: "LOST" | "BROKEN";
    occurredOn: string;
    note: string | null;
    expectedVersion: number;
    actorUserId: number;
    raiseSupplierAlert: boolean;
  }): Promise<{
    cylinder: Cylinder;
    alert: {
      id: number;
      alert_type: string;
      entity_table: string | null;
      entity_id: number | null;
      severity: number;
      created_at: Date;
      resolved_at: Date | null;
      assigned_role: string | null;
    } | null;
  }> {
    const db = resolveDb(this.db);

    const updated = await db
      .updateTable("cylinder")
      .set({
        state: params.outcome,
        condition: "EMPTY",
        updated_by: params.actorUserId,
      })
      .where("id", "=", params.cylinderId)
      .where("version", "=", params.expectedVersion)
      .where("deleted_at", "is", null)
      .returning("id")
      .executeTakeFirst();

    if (!updated) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Cylinder version conflict");
    }

    const openMove = await db
      .selectFrom("movement_event")
      .select(["id", "note"])
      .where("cylinder_id", "=", params.cylinderId)
      .where("state", "=", "OPEN")
      .where("return_date", "is", null)
      .executeTakeFirst();

    if (openMove) {
      const note = openMove.note
        ? `${openMove.note}\n${params.note ?? params.outcome}`
        : (params.note ?? params.outcome);
      await db
        .updateTable("movement_event")
        .set({
          return_date: params.occurredOn,
          state: "LOST",
          note,
          updated_by: params.actorUserId,
        })
        .where("id", "=", openMove.id)
        .execute();
    }

    let alert: {
      id: number;
      alert_type: string;
      entity_table: string | null;
      entity_id: number | null;
      severity: number;
      created_at: Date;
      resolved_at: Date | null;
      assigned_role: string | null;
    } | null = null;

    if (params.raiseSupplierAlert) {
      alert =
        (await db
          .insertInto("alert")
          .values({
            alert_type: "SUPPLIER_LIABILITY",
            entity_table: "cylinder",
            entity_id: params.cylinderId,
            severity: 2,
            assigned_role: "INVENTORY",
          })
          .returning([
            "id",
            "alert_type",
            "entity_table",
            "entity_id",
            "severity",
            "created_at",
            "resolved_at",
            "assigned_role",
          ])
          .executeTakeFirst()) ?? null;
    }

    const cylinder = await this.getById(params.cylinderId);
    if (!cylinder) throw ApiErrors.notFound("Cylinder not found after loss");
    return { cylinder, alert };
  }
}

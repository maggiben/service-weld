import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateMovementInput,
  MovementEvent,
  MovementListQuery,
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
import type {
  CylinderState,
  MovementKind,
  MovementState,
  OwnershipBasis,
} from "../database/schema.types";

interface MovementRow {
  id: number;
  request_id: string;
  cylinder_id: number;
  holder_party_id: number;
  holder_name: string;
  movement_kind: MovementKind;
  property_basis: OwnershipBasis;
  gas_code: string | null;
  delivery_date: string | Date;
  return_date: string | Date | null;
  rental_days: number | null;
  origin_party_id: number | null;
  swap_with_cyl_id: number | null;
  remito_id: number | null;
  state: MovementState;
  note: string | null;
  version: number;
  created_at: Date;
  cylinder_serial: string;
}

interface CylinderForDelivery {
  id: number;
  state: CylinderState;
  ownership_basis: OwnershipBasis;
  gas_code: string | null;
  serial_number: string;
  packaging: "SINGLE" | "BATTERY" | "BATTERY_MEMBER";
}

function toIsoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapMovement(row: MovementRow): MovementEvent {
  return {
    id: Number(row.id),
    request_id: row.request_id,
    cylinder_id: Number(row.cylinder_id),
    holder_party_id: Number(row.holder_party_id),
    holder_name: row.holder_name,
    movement_kind: row.movement_kind,
    property_basis: row.property_basis,
    gas_code: row.gas_code as MovementEvent["gas_code"],
    delivery_date: toIsoDate(row.delivery_date)!,
    return_date: toIsoDate(row.return_date),
    rental_days: row.rental_days == null ? null : Number(row.rental_days),
    origin_party_id:
      row.origin_party_id == null ? null : Number(row.origin_party_id),
    swap_with_cyl_id:
      row.swap_with_cyl_id == null ? null : Number(row.swap_with_cyl_id),
    remito_id: row.remito_id == null ? null : Number(row.remito_id),
    state: row.state,
    note: row.note,
    version: row.version,
    created_at: row.created_at.toISOString(),
    cylinder_serial: row.cylinder_serial,
  };
}

@Injectable()
export class MovementsRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: MovementListQuery): Promise<{
    data: MovementEvent[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["delivery_date", "rental_days"]);

    let qb = db
      .selectFrom("movement_event")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .leftJoin("client", "client.party_id", "movement_event.holder_party_id")
      .select([
        "movement_event.id",
        "movement_event.request_id",
        "movement_event.cylinder_id",
        "movement_event.holder_party_id",
        "party.display_name as holder_name",
        "movement_event.movement_kind",
        "movement_event.property_basis",
        "movement_event.gas_code",
        "movement_event.delivery_date",
        "movement_event.return_date",
        "movement_event.rental_days",
        "movement_event.origin_party_id",
        "movement_event.swap_with_cyl_id",
        "movement_event.remito_id",
        "movement_event.state",
        "movement_event.note",
        "movement_event.version",
        "movement_event.created_at",
        "cylinder.serial_number as cylinder_serial",
      ]);

    if (query.open) {
      qb = qb
        .where("movement_event.state", "=", "OPEN")
        .where("movement_event.return_date", "is", null);
    }
    if (query["filter[cylinder_id]"] != null) {
      qb = qb.where(
        "movement_event.cylinder_id",
        "=",
        query["filter[cylinder_id]"],
      );
    }
    if (query["filter[holder_party_id]"] != null) {
      qb = qb.where(
        "movement_event.holder_party_id",
        "=",
        query["filter[holder_party_id]"],
      );
    } else if (query["filter[locality_id]"] != null) {
      qb = qb.where("client.locality_id", "=", query["filter[locality_id]"]);
    }
    if (query["filter[state]"]) {
      qb = qb.where("movement_event.state", "=", query["filter[state]"]);
    }
    if (query["filter[movement_kind]"]) {
      qb = qb.where(
        "movement_event.movement_kind",
        "=",
        query["filter[movement_kind]"],
      );
    }
    if (query["filter[gas_code]"]) {
      qb = qb.where("movement_event.gas_code", "=", query["filter[gas_code]"]);
    }

    if (query.cursor && sort.field === "delivery_date") {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = String(cursor.delivery_date ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("movement_event.delivery_date", ">", cursorDate),
                eb.and([
                  eb("movement_event.delivery_date", "=", cursorDate),
                  eb("movement_event.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("movement_event.delivery_date", "<", cursorDate),
                eb.and([
                  eb("movement_event.delivery_date", "=", cursorDate),
                  eb("movement_event.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const sortColumn =
      sort.field === "rental_days"
        ? "movement_event.rental_days"
        : "movement_event.delivery_date";

    const rows = (await qb
      .orderBy(sortColumn, sort.direction)
      .orderBy("movement_event.id", sort.direction)
      .limit(limit + 1)
      .execute()) as MovementRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map(mapMovement),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                delivery_date: toIsoDate(last.delivery_date),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getById(id: number): Promise<MovementEvent | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("movement_event")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .select([
        "movement_event.id",
        "movement_event.request_id",
        "movement_event.cylinder_id",
        "movement_event.holder_party_id",
        "party.display_name as holder_name",
        "movement_event.movement_kind",
        "movement_event.property_basis",
        "movement_event.gas_code",
        "movement_event.delivery_date",
        "movement_event.return_date",
        "movement_event.rental_days",
        "movement_event.origin_party_id",
        "movement_event.swap_with_cyl_id",
        "movement_event.remito_id",
        "movement_event.state",
        "movement_event.note",
        "movement_event.version",
        "movement_event.created_at",
        "cylinder.serial_number as cylinder_serial",
      ])
      .where("movement_event.id", "=", id)
      .executeTakeFirst()) as MovementRow | undefined;

    return row ? mapMovement(row) : null;
  }

  async getCylinderForDelivery(
    cylinderId: number,
  ): Promise<CylinderForDelivery | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("cylinder")
      .select([
        "id",
        "state",
        "ownership_basis",
        "gas_code",
        "serial_number",
        "packaging",
      ])
      .where("id", "=", cylinderId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row
      ? {
          id: Number(row.id),
          state: row.state,
          ownership_basis: row.ownership_basis,
          gas_code: row.gas_code,
          serial_number: row.serial_number,
          packaging: row.packaging,
        }
      : null;
  }

  async holderExists(partyId: number): Promise<boolean> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("party")
      .select("id")
      .where("id", "=", partyId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return Boolean(row);
  }

  async hasOpenMovement(cylinderId: number): Promise<boolean> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("movement_event")
      .select("id")
      .where("cylinder_id", "=", cylinderId)
      .where("state", "=", "OPEN")
      .where("return_date", "is", null)
      .executeTakeFirst();
    return Boolean(row);
  }

  async createDelivery(
    input: CreateMovementInput,
    propertyBasis: OwnershipBasis,
    gasCode: string | null,
    actorUserId: number,
  ): Promise<MovementEvent> {
    const db = resolveDb(this.db);

    const inserted = await db
      .insertInto("movement_event")
      .values({
        ...(input.request_id ? { request_id: input.request_id } : {}),
        cylinder_id: input.cylinder_id,
        holder_party_id: input.holder_party_id,
        movement_kind: input.movement_kind,
        property_basis: propertyBasis,
        gas_code: gasCode,
        delivery_date: input.delivery_date,
        return_date: null,
        origin_party_id: input.origin_party_id ?? null,
        note: input.note ?? null,
        state: "OPEN",
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .updateTable("cylinder")
      .set({
        state: "AT_CLIENT",
        condition: "FULL",
        updated_by: actorUserId,
      })
      .where("id", "=", input.cylinder_id)
      .execute();

    const created = await this.getById(Number(inserted.id));
    if (!created) throw ApiErrors.notFound("Movement not found after create");
    return created;
  }

  async closeReturn(
    movementId: number,
    cylinderId: number,
    returnDate: string,
    expectedVersion: number,
    actorUserId: number,
  ): Promise<MovementEvent> {
    const db = resolveDb(this.db);

    const updated = await db
      .updateTable("movement_event")
      .set({
        return_date: returnDate,
        state: "CLOSED",
        updated_by: actorUserId,
      })
      .where("id", "=", movementId)
      .where("state", "=", "OPEN")
      .where("version", "=", expectedVersion)
      .returning("id")
      .executeTakeFirst();

    if (!updated) {
      throw ApiErrors.conflict(
        "VERSION_CONFLICT",
        "Movement version conflict or not OPEN",
      );
    }

    await db
      .updateTable("cylinder")
      .set({
        state: "IN_STOCK_EMPTY",
        condition: "EMPTY",
        updated_by: actorUserId,
      })
      .where("id", "=", cylinderId)
      .execute();

    const closed = await this.getById(movementId);
    if (!closed) throw ApiErrors.notFound("Movement not found after return");
    return closed;
  }

  /**
   * W9 / US-10 canje: client returns the open serial and receives another from stock.
   * - Close open movement as SWAPPED (linked to the replacement cylinder).
   * - Delivered serial → IN_STOCK_EMPTY.
   * - Replacement serial → AT_CLIENT with a new OPEN movement (same holder).
   */
  async swapReturn(params: {
    movementId: number;
    deliveredCylinderId: number;
    replacementCylinderId: number;
    holderPartyId: number;
    movementKind: MovementKind;
    propertyBasis: OwnershipBasis;
    gasCode: string | null;
    swapDate: string;
    expectedVersion: number;
    actorUserId: number;
  }): Promise<MovementEvent> {
    const db = resolveDb(this.db);
    const {
      movementId,
      deliveredCylinderId,
      replacementCylinderId,
      holderPartyId,
      movementKind,
      propertyBasis,
      gasCode,
      swapDate,
      expectedVersion,
      actorUserId,
    } = params;

    const updated = await db
      .updateTable("movement_event")
      .set({
        return_date: swapDate,
        state: "SWAPPED",
        swap_with_cyl_id: replacementCylinderId,
        updated_by: actorUserId,
      })
      .where("id", "=", movementId)
      .where("state", "=", "OPEN")
      .where("version", "=", expectedVersion)
      .returning("id")
      .executeTakeFirst();

    if (!updated) {
      throw ApiErrors.conflict(
        "VERSION_CONFLICT",
        "Movement version conflict or not OPEN",
      );
    }

    await db
      .updateTable("cylinder")
      .set({
        state: "IN_STOCK_EMPTY",
        condition: "EMPTY",
        updated_by: actorUserId,
      })
      .where("id", "=", deliveredCylinderId)
      .execute();

    await db
      .insertInto("movement_event")
      .values({
        cylinder_id: replacementCylinderId,
        holder_party_id: holderPartyId,
        movement_kind: movementKind,
        property_basis: propertyBasis,
        gas_code: gasCode,
        delivery_date: swapDate,
        return_date: null,
        state: "OPEN",
        note: `Canje desde movimiento #${movementId}`,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .execute();

    await db
      .updateTable("cylinder")
      .set({
        state: "AT_CLIENT",
        condition: "FULL",
        updated_by: actorUserId,
      })
      .where("id", "=", replacementCylinderId)
      .execute();

    const swapped = await this.getById(movementId);
    if (!swapped) throw ApiErrors.notFound("Movement not found after swap");
    return swapped;
  }

  async voidMovement(
    movementId: number,
    cylinderId: number,
    wasOpen: boolean,
    reason: string,
    expectedVersion: number,
    actorUserId: number,
  ): Promise<MovementEvent> {
    const db = resolveDb(this.db);

    const existing = await this.getById(movementId);
    if (!existing) throw ApiErrors.notFound("Movement not found");

    const note = existing.note
      ? `${existing.note}\nVOID: ${reason}`
      : `VOID: ${reason}`;

    const updated = await db
      .updateTable("movement_event")
      .set({
        state: "VOID",
        note,
        updated_by: actorUserId,
      })
      .where("id", "=", movementId)
      .where("version", "=", expectedVersion)
      .where("state", "!=", "VOID")
      .returning("id")
      .executeTakeFirst();

    if (!updated) {
      throw ApiErrors.conflict(
        "VERSION_CONFLICT",
        "Movement version conflict or already VOID",
      );
    }

    if (wasOpen) {
      await db
        .updateTable("cylinder")
        .set({
          state: "IN_STOCK_EMPTY",
          condition: "EMPTY",
          updated_by: actorUserId,
        })
        .where("id", "=", cylinderId)
        .execute();
    }

    const voided = await this.getById(movementId);
    if (!voided) throw ApiErrors.notFound("Movement not found after void");
    return voided;
  }

  async findOpenIdByCylinder(cylinderId: number): Promise<number | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("movement_event")
      .select("id")
      .where("cylinder_id", "=", cylinderId)
      .where("state", "=", "OPEN")
      .where("return_date", "is", null)
      .executeTakeFirst();
    return row ? Number(row.id) : null;
  }
}

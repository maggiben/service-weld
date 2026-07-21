import { Inject, Injectable } from "@nestjs/common";
import type {
  Accessory,
  AccessoryListQuery,
  AccessoryRental,
  AccessoryRentalListQuery,
  CreateAccessoryInput,
  CreateAccessoryRentalInput,
  ReturnAccessoryRentalInput,
  UpdateAccessoryInput,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import type {
  AccessoryRentalState,
  AccessoryState,
  AccessoryType,
  ChargeBasis,
} from "../database/schema.types";
import { resolveDb } from "../database/transaction.context";

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class AccessoriesRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async listAccessories(query: AccessoryListQuery): Promise<{
    data: Accessory[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["updated_at"]);

    let qb = db
      .selectFrom("accessory")
      .innerJoin("party", "party.id", "accessory.owner_party_id")
      .select([
        "accessory.id",
        "accessory.accessory_type",
        "accessory.identifier",
        "accessory.owner_party_id",
        "party.display_name as owner_name",
        "accessory.state",
        "accessory.version",
        "accessory.created_at",
        "accessory.updated_at",
      ])
      .where("accessory.deleted_at", "is", null);

    if (query["filter[accessory_type]"]) {
      qb = qb.where(
        "accessory.accessory_type",
        "=",
        query["filter[accessory_type]"],
      );
    }
    if (query["filter[state]"]) {
      qb = qb.where("accessory.state", "=", query["filter[state]"]);
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorAt = String(cursor.updated_at ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("accessory.updated_at", ">", new Date(cursorAt)),
                eb.and([
                  eb("accessory.updated_at", "=", new Date(cursorAt)),
                  eb("accessory.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("accessory.updated_at", "<", new Date(cursorAt)),
                eb.and([
                  eb("accessory.updated_at", "=", new Date(cursorAt)),
                  eb("accessory.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = await qb
      .orderBy("accessory.updated_at", sort.direction)
      .orderBy("accessory.id", sort.direction)
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) => ({
        id: Number(row.id),
        accessory_type: row.accessory_type,
        identifier: row.identifier,
        owner_party_id: Number(row.owner_party_id),
        owner_name: row.owner_name,
        state: row.state,
        version: Number(row.version),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      })),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                updated_at: last.updated_at.toISOString(),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getAccessory(id: number): Promise<Accessory | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("accessory")
      .innerJoin("party", "party.id", "accessory.owner_party_id")
      .select([
        "accessory.id",
        "accessory.accessory_type",
        "accessory.identifier",
        "accessory.owner_party_id",
        "party.display_name as owner_name",
        "accessory.state",
        "accessory.version",
        "accessory.created_at",
        "accessory.updated_at",
      ])
      .where("accessory.id", "=", id)
      .where("accessory.deleted_at", "is", null)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: Number(row.id),
      accessory_type: row.accessory_type,
      identifier: row.identifier,
      owner_party_id: Number(row.owner_party_id),
      owner_name: row.owner_name,
      state: row.state,
      version: Number(row.version),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  async createAccessory(
    input: CreateAccessoryInput,
    actorUserId: number,
  ): Promise<Accessory> {
    const db = resolveDb(this.db);
    const inserted = await db
      .insertInto("accessory")
      .values({
        accessory_type: input.accessory_type,
        identifier: input.identifier ?? null,
        owner_party_id: input.owner_party_id,
        state: "IN_STOCK",
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const created = await this.getAccessory(Number(inserted.id));
    if (!created) throw ApiErrors.notFound("Accessory not found after create");
    return created;
  }

  async updateAccessory(
    id: number,
    input: UpdateAccessoryInput,
    actorUserId: number,
    expectedVersion: number,
  ): Promise<Accessory> {
    const db = resolveDb(this.db);
    const patch: {
      identifier?: string | null;
      state?: AccessoryState;
      updated_by: number;
      version: number;
    } = {
      updated_by: actorUserId,
      version: expectedVersion + 1,
    };
    if (input.identifier !== undefined) patch.identifier = input.identifier;
    if (input.state !== undefined) patch.state = input.state;

    const updated = await db
      .updateTable("accessory")
      .set(patch)
      .where("id", "=", id)
      .where("version", "=", expectedVersion)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.conflict(
        "VERSION_CONFLICT",
        "Accessory version conflict",
      );
    }
    const result = await this.getAccessory(id);
    if (!result) throw ApiErrors.notFound("Accessory not found");
    return result;
  }

  async listRentals(query: AccessoryRentalListQuery): Promise<{
    data: AccessoryRental[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["start_date"]);

    let qb = db
      .selectFrom("accessory_rental")
      .innerJoin("accessory", "accessory.id", "accessory_rental.accessory_id")
      .innerJoin("party", "party.id", "accessory_rental.client_party_id")
      .select([
        "accessory_rental.id",
        "accessory_rental.accessory_id",
        "accessory.accessory_type",
        "accessory.identifier as accessory_identifier",
        "accessory_rental.client_party_id",
        "party.display_name as client_name",
        "accessory_rental.quantity",
        "accessory_rental.start_date",
        "accessory_rental.end_date",
        "accessory_rental.charge_basis",
        "accessory_rental.remito_id",
        "accessory_rental.state",
        "accessory_rental.version",
        "accessory_rental.updated_at",
      ]);

    if (query.open === true) {
      qb = qb.where("accessory_rental.state", "=", "ON_LOAN");
    } else if (query.open === false) {
      qb = qb.where("accessory_rental.state", "!=", "ON_LOAN");
    }
    if (query["filter[client_party_id]"] != null) {
      qb = qb.where(
        "accessory_rental.client_party_id",
        "=",
        query["filter[client_party_id]"],
      );
    }
    if (query["filter[state]"]) {
      qb = qb.where("accessory_rental.state", "=", query["filter[state]"]);
    }
    if (query["filter[accessory_type]"]) {
      qb = qb.where(
        "accessory.accessory_type",
        "=",
        query["filter[accessory_type]"],
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = String(cursor.start_date ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("accessory_rental.start_date", ">", cursorDate),
                eb.and([
                  eb("accessory_rental.start_date", "=", cursorDate),
                  eb("accessory_rental.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("accessory_rental.start_date", "<", cursorDate),
                eb.and([
                  eb("accessory_rental.start_date", "=", cursorDate),
                  eb("accessory_rental.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = await qb
      .orderBy("accessory_rental.start_date", sort.direction)
      .orderBy("accessory_rental.id", sort.direction)
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) => this.mapRental(row)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                start_date: isoDate(last.start_date),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getRental(id: number): Promise<AccessoryRental | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("accessory_rental")
      .innerJoin("accessory", "accessory.id", "accessory_rental.accessory_id")
      .innerJoin("party", "party.id", "accessory_rental.client_party_id")
      .select([
        "accessory_rental.id",
        "accessory_rental.accessory_id",
        "accessory.accessory_type",
        "accessory.identifier as accessory_identifier",
        "accessory_rental.client_party_id",
        "party.display_name as client_name",
        "accessory_rental.quantity",
        "accessory_rental.start_date",
        "accessory_rental.end_date",
        "accessory_rental.charge_basis",
        "accessory_rental.remito_id",
        "accessory_rental.state",
        "accessory_rental.version",
        "accessory_rental.updated_at",
      ])
      .where("accessory_rental.id", "=", id)
      .executeTakeFirst();
    return row ? this.mapRental(row) : null;
  }

  async createRental(
    input: CreateAccessoryRentalInput,
    actorUserId: number,
  ): Promise<AccessoryRental> {
    const db = resolveDb(this.db);

    let remitoId: number | null = null;
    if (input.remito_number) {
      const existing = await db
        .selectFrom("delivery_note")
        .select("id")
        .where("remito_number", "=", input.remito_number)
        .executeTakeFirst();
      if (existing) {
        remitoId = Number(existing.id);
      } else {
        const inserted = await db
          .insertInto("delivery_note")
          .values({
            remito_number: input.remito_number,
            issued_date: input.start_date,
            client_party_id: input.client_party_id,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        remitoId = Number(inserted.id);
      }
    }

    const inserted = await db
      .insertInto("accessory_rental")
      .values({
        accessory_id: input.accessory_id,
        client_party_id: input.client_party_id,
        quantity: input.quantity,
        start_date: input.start_date,
        charge_basis: input.charge_basis,
        remito_id: remitoId,
        state: "ON_LOAN",
        note: input.note ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .updateTable("accessory")
      .set({ state: "ON_LOAN", updated_by: actorUserId })
      .where("id", "=", input.accessory_id)
      .execute();

    const rental = await this.getRental(Number(inserted.id));
    if (!rental) throw ApiErrors.notFound("Rental not found after create");
    return rental;
  }

  async returnRental(
    id: number,
    input: ReturnAccessoryRentalInput,
    expectedVersion: number,
    actorUserId: number,
  ): Promise<AccessoryRental> {
    const db = resolveDb(this.db);
    const current = await this.getRental(id);
    if (!current) throw ApiErrors.notFound("Rental not found");

    const updated = await db
      .updateTable("accessory_rental")
      .set({
        end_date: input.end_date,
        state: "RETURNED" as AccessoryRentalState,
        version: expectedVersion + 1,
      })
      .where("id", "=", id)
      .where("version", "=", expectedVersion)
      .where("state", "=", "ON_LOAN")
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.conflict(
        "VERSION_CONFLICT",
        "Rental version conflict or not ON_LOAN",
      );
    }

    await db
      .updateTable("accessory")
      .set({ state: "IN_STOCK", updated_by: actorUserId })
      .where("id", "=", current.accessory_id)
      .execute();

    const rental = await this.getRental(id);
    if (!rental) throw ApiErrors.notFound("Rental not found");
    return rental;
  }

  async clientExists(partyId: number): Promise<boolean> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("client")
      .select("party_id")
      .where("party_id", "=", partyId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row != null;
  }

  private mapRental(row: {
    id: number | string;
    accessory_id: number | string;
    accessory_type: AccessoryType;
    accessory_identifier: string | null;
    client_party_id: number | string;
    client_name: string;
    quantity: number;
    start_date: string | Date;
    end_date: string | Date | null;
    charge_basis: ChargeBasis;
    remito_id: number | string | null;
    state: AccessoryRentalState;
    version: number;
    updated_at: Date;
  }): AccessoryRental {
    return {
      id: Number(row.id),
      accessory_id: Number(row.accessory_id),
      accessory_type: row.accessory_type,
      accessory_identifier: row.accessory_identifier,
      client_party_id: Number(row.client_party_id),
      client_name: row.client_name,
      quantity: Number(row.quantity),
      start_date: isoDate(row.start_date)!,
      end_date: isoDate(row.end_date),
      charge_basis: row.charge_basis,
      remito_id: row.remito_id == null ? null : Number(row.remito_id),
      state: row.state,
      version: Number(row.version),
      updated_at: row.updated_at.toISOString(),
    };
  }
}

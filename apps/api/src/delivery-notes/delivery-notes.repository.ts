import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateDeliveryNoteInput,
  DeliveryNote,
  DeliveryNoteDetail,
  DeliveryNoteLinkedMovement,
  DeliveryNoteLinkedRental,
  DeliveryNoteListQuery,
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
import type {
  AccessoryRentalState,
  AccessoryType,
  ChargeBasis,
  DeliveryNoteKind,
  MovementKind,
  MovementState,
} from "../database/schema.types";
import { resolveDb } from "../database/transaction.context";

interface DeliveryNoteRow {
  id: number;
  remito_number: string;
  kind: DeliveryNoteKind;
  issued_date: string | Date | null;
  client_party_id: number | null;
  client_name: string | null;
  movement_count?: string | number | null;
  accessory_rental_count?: string | number | null;
}

interface LinkedMovementRow {
  id: number;
  cylinder_id: number;
  cylinder_serial: string;
  holder_party_id: number;
  holder_name: string;
  movement_kind: MovementKind;
  delivery_date: string | Date;
  return_date: string | Date | null;
  state: MovementState;
}

interface LinkedRentalRow {
  id: number;
  accessory_id: number;
  accessory_type: AccessoryType;
  accessory_identifier: string | null;
  client_party_id: number;
  client_name: string;
  start_date: string | Date;
  end_date: string | Date | null;
  charge_basis: ChargeBasis;
  state: AccessoryRentalState;
}

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toCount(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function mapNote(row: DeliveryNoteRow): DeliveryNote {
  return {
    id: Number(row.id),
    remito_number: row.remito_number,
    kind: row.kind,
    issued_date: isoDate(row.issued_date),
    client_party_id:
      row.client_party_id == null ? null : Number(row.client_party_id),
    client_name: row.client_name,
    movement_count: toCount(row.movement_count),
    accessory_rental_count: toCount(row.accessory_rental_count),
  };
}

function mapLinkedMovement(row: LinkedMovementRow): DeliveryNoteLinkedMovement {
  return {
    id: Number(row.id),
    cylinder_id: Number(row.cylinder_id),
    cylinder_serial: row.cylinder_serial,
    holder_party_id: Number(row.holder_party_id),
    holder_name: row.holder_name,
    movement_kind: row.movement_kind,
    delivery_date: isoDate(row.delivery_date)!,
    return_date: isoDate(row.return_date),
    state: row.state,
  };
}

function mapLinkedRental(row: LinkedRentalRow): DeliveryNoteLinkedRental {
  return {
    id: Number(row.id),
    accessory_id: Number(row.accessory_id),
    accessory_type: row.accessory_type,
    accessory_identifier: row.accessory_identifier,
    client_party_id: Number(row.client_party_id),
    client_name: row.client_name,
    start_date: isoDate(row.start_date)!,
    end_date: isoDate(row.end_date),
    charge_basis: row.charge_basis,
    state: row.state,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/** Null issued_date sorts as epoch so undated remitos sink on -issued_date. */
const SORT_DATE = sql<string>`coalesce(delivery_note.issued_date, DATE '1970-01-01')`;

const NOTE_SELECT = [
  "delivery_note.id",
  "delivery_note.remito_number",
  "delivery_note.kind",
  "delivery_note.issued_date",
  "delivery_note.client_party_id",
  "party.display_name as client_name",
] as const;

@Injectable()
export class DeliveryNotesRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: DeliveryNoteListQuery): Promise<{
    data: DeliveryNote[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["issued_date", "remito_number"]);

    let qb = db
      .selectFrom("delivery_note")
      .leftJoin("party", "party.id", "delivery_note.client_party_id")
      .select([
        ...NOTE_SELECT,
        sql<string>`(
          select count(*)::int from movement_event
          where movement_event.remito_id = delivery_note.id
        )`.as("movement_count"),
        sql<string>`(
          select count(*)::int from accessory_rental
          where accessory_rental.remito_id = delivery_note.id
        )`.as("accessory_rental_count"),
      ]);

    if (query["filter[client_party_id]"] != null) {
      qb = qb.where(
        "delivery_note.client_party_id",
        "=",
        query["filter[client_party_id]"],
      );
    }
    if (query["filter[kind]"]) {
      qb = qb.where("delivery_note.kind", "=", query["filter[kind]"]);
    }
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([
          eb("delivery_note.remito_number", "ilike", term),
          eb("party.display_name", "ilike", term),
        ]),
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorId = Number(cursor.id ?? 0);
      if (sort.field === "remito_number") {
        const cursorNumber = String(cursor.remito_number ?? "");
        qb =
          sort.direction === "asc"
            ? qb.where((eb) =>
                eb.or([
                  eb("delivery_note.remito_number", ">", cursorNumber),
                  eb.and([
                    eb("delivery_note.remito_number", "=", cursorNumber),
                    eb("delivery_note.id", ">", cursorId),
                  ]),
                ]),
              )
            : qb.where((eb) =>
                eb.or([
                  eb("delivery_note.remito_number", "<", cursorNumber),
                  eb.and([
                    eb("delivery_note.remito_number", "=", cursorNumber),
                    eb("delivery_note.id", "<", cursorId),
                  ]),
                ]),
              );
      } else {
        const cursorDate = String(cursor.sort_date ?? "1970-01-01");
        qb =
          sort.direction === "asc"
            ? qb.where((eb) =>
                eb.or([
                  eb(SORT_DATE, ">", cursorDate),
                  eb.and([
                    eb(SORT_DATE, "=", cursorDate),
                    eb("delivery_note.id", ">", cursorId),
                  ]),
                ]),
              )
            : qb.where((eb) =>
                eb.or([
                  eb(SORT_DATE, "<", cursorDate),
                  eb.and([
                    eb(SORT_DATE, "=", cursorDate),
                    eb("delivery_note.id", "<", cursorId),
                  ]),
                ]),
              );
      }
    }

    if (sort.field === "remito_number") {
      qb = qb
        .orderBy("delivery_note.remito_number", sort.direction)
        .orderBy("delivery_note.id", sort.direction);
    } else {
      qb = qb
        .orderBy(SORT_DATE, sort.direction)
        .orderBy("delivery_note.id", sort.direction);
    }

    const rows = (await qb.limit(limit + 1).execute()) as DeliveryNoteRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    const nextCursor =
      hasMore && last
        ? encodeCursor({
            id: Number(last.id),
            remito_number: last.remito_number,
            sort_date: isoDate(last.issued_date) ?? "1970-01-01",
          })
        : null;

    return {
      data: pageRows.map(mapNote),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor,
      }),
    };
  }

  async getById(id: number): Promise<DeliveryNote | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("delivery_note")
      .leftJoin("party", "party.id", "delivery_note.client_party_id")
      .select([
        ...NOTE_SELECT,
        sql<string>`(
          select count(*)::int from movement_event
          where movement_event.remito_id = delivery_note.id
        )`.as("movement_count"),
        sql<string>`(
          select count(*)::int from accessory_rental
          where accessory_rental.remito_id = delivery_note.id
        )`.as("accessory_rental_count"),
      ])
      .where("delivery_note.id", "=", id)
      .executeTakeFirst()) as DeliveryNoteRow | undefined;
    return row ? mapNote(row) : null;
  }

  async getDetail(id: number): Promise<DeliveryNoteDetail | null> {
    const note = await this.getById(id);
    if (!note) return null;

    const db = resolveDb(this.db);
    const [movements, rentals] = await Promise.all([
      db
        .selectFrom("movement_event")
        .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
        .innerJoin("party", "party.id", "movement_event.holder_party_id")
        .select([
          "movement_event.id",
          "movement_event.cylinder_id",
          "cylinder.serial_number as cylinder_serial",
          "movement_event.holder_party_id",
          "party.display_name as holder_name",
          "movement_event.movement_kind",
          "movement_event.delivery_date",
          "movement_event.return_date",
          "movement_event.state",
        ])
        .where("movement_event.remito_id", "=", id)
        .orderBy("movement_event.delivery_date", "desc")
        .orderBy("movement_event.id", "desc")
        .limit(100)
        .execute() as Promise<LinkedMovementRow[]>,
      db
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
          "accessory_rental.start_date",
          "accessory_rental.end_date",
          "accessory_rental.charge_basis",
          "accessory_rental.state",
        ])
        .where("accessory_rental.remito_id", "=", id)
        .orderBy("accessory_rental.start_date", "desc")
        .orderBy("accessory_rental.id", "desc")
        .limit(100)
        .execute() as Promise<LinkedRentalRow[]>,
    ]);

    return {
      ...note,
      movements: movements.map(mapLinkedMovement),
      accessory_rentals: rentals.map(mapLinkedRental),
    };
  }

  async create(input: CreateDeliveryNoteInput): Promise<DeliveryNote> {
    const db = resolveDb(this.db);
    try {
      const inserted = await db
        .insertInto("delivery_note")
        .values({
          remito_number: input.remito_number.trim(),
          kind: input.kind ?? "DELIVERY",
          issued_date: input.issued_date ?? null,
          client_party_id: input.client_party_id ?? null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      const created = await this.getById(Number(inserted.id));
      if (!created) throw ApiErrors.notFound("Delivery note not found");
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "DUPLICATE_REMITO",
          "A delivery note with this remito number already exists",
        );
      }
      throw error;
    }
  }
}

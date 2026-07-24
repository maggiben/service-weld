import { Inject, Injectable } from "@nestjs/common";
import { businessTodayIso, calendarDaysBetween } from "@weld/domain";
import type {
  CreateMovementInput,
  MovementEvent,
  MovementListQuery,
} from "@weld/schemas";
import { sql, type Kysely, type SqlBool } from "kysely";
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
  Database,
  MovementKind,
  MovementState,
  OwnershipBasis,
} from "../database/schema.types";
import {
  allocateClosedDeliveryNote,
  resolveDeliveryNote,
} from "../delivery-notes/resolve-delivery-note";
import { ensureRemitoCylinderLine } from "../delivery-notes/ensure-remito-cylinder-line";

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
  remito_number: string | null;
  state: MovementState;
  note: string | null;
  version: number;
  created_at: Date;
  cylinder_serial: string;
  capacity_m3: string | number | null;
  capacity_unit: "M3" | "KG" | null;
  locality_name: string | null;
  owner_party_id: number | null;
  owner_name: string | null;
}

interface CylinderForDelivery {
  id: number;
  state: CylinderState;
  ownership_basis: OwnershipBasis;
  gas_code: string | null;
  serial_number: string;
  packaging: "SINGLE" | "BATTERY" | "BATTERY_MEMBER";
  capacity_m3: number | null;
  capacity_unit: "M3" | "KG";
}

function toIsoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

const MOVEMENT_LIST_SORT_FIELDS = [
  "delivery_date",
  "return_date",
  "cylinder_serial",
  "holder_name",
  "property_basis",
  "movement_kind",
  "gas_code",
  "rental_days",
  "state",
  "capacity_m3",
  "locality_name",
  "owner_name",
] as const;

/**
 * Display / sort key for Días (BR-03): stored rental_days when set; else accrued
 * calendar days for OPEN rentals. Matches web `displayRentalDays`.
 */
function effectiveRentalDaysSql(asOf: string) {
  return sql<number | null>`
    case
      when movement_event.movement_kind = 'REFILL' then null
      when movement_event.rental_days is not null then movement_event.rental_days
      when movement_event.state = 'OPEN' then (${asOf}::date - movement_event.delivery_date)
      else null
    end
  `;
}

function effectiveRentalDaysForRow(
  row: Pick<
    MovementRow,
    "movement_kind" | "rental_days" | "state" | "delivery_date"
  >,
  asOf: string,
): number | null {
  if (row.movement_kind === "REFILL") return null;
  if (row.rental_days != null) return Number(row.rental_days);
  if (row.state === "OPEN") {
    return calendarDaysBetween(toIsoDate(row.delivery_date)!, asOf);
  }
  return null;
}

function rentalDaysSortKey(asOf: string, direction: "asc" | "desc") {
  const daysExpr = effectiveRentalDaysSql(asOf);
  // Sentinels keep null display days (—, refill, void) at the end for both dirs.
  return direction === "asc"
    ? sql`coalesce((${daysExpr}), 2147483647)`
    : sql`coalesce((${daysExpr}), -2147483648)`;
}

function movementListCursorPayload(
  sortField: (typeof MOVEMENT_LIST_SORT_FIELDS)[number],
  last: MovementRow,
  asOf: string,
): Record<string, string | number | null> {
  const id = Number(last.id);
  switch (sortField) {
    case "return_date":
      return { return_date: toIsoDate(last.return_date), id };
    case "cylinder_serial":
      return { cylinder_serial: last.cylinder_serial, id };
    case "holder_name":
      return { holder_name: last.holder_name, id };
    case "property_basis":
      return { property_basis: last.property_basis, id };
    case "movement_kind":
      return { movement_kind: last.movement_kind, id };
    case "gas_code":
      return { gas_code: last.gas_code, id };
    case "rental_days":
      return {
        rental_days: effectiveRentalDaysForRow(last, asOf),
        id,
      };
    case "state":
      return { state: last.state, id };
    case "capacity_m3":
      return {
        capacity_m3: last.capacity_m3 == null ? null : Number(last.capacity_m3),
        id,
      };
    case "locality_name":
      return { locality_name: last.locality_name, id };
    case "owner_name":
      return { owner_name: last.owner_name, id };
    case "delivery_date":
    default:
      return { delivery_date: toIsoDate(last.delivery_date), id };
  }
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
    remito_number: row.remito_number,
    state: row.state,
    note: row.note,
    version: row.version,
    created_at: row.created_at.toISOString(),
    cylinder_serial: row.cylinder_serial,
    capacity_m3: row.capacity_m3 == null ? null : Number(row.capacity_m3),
    capacity_unit: row.capacity_unit ?? "M3",
    locality_name: row.locality_name,
    owner_party_id:
      row.owner_party_id == null ? null : Number(row.owner_party_id),
    owner_name: row.owner_name,
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
    const sort = parseSort(query.sort, MOVEMENT_LIST_SORT_FIELDS);
    const asOf = businessTodayIso();
    const asc = sort.direction === "asc";
    const daysSortKey = rentalDaysSortKey(asOf, sort.direction);

    let qb = db
      .selectFrom("movement_event")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .leftJoin("client", "client.party_id", "movement_event.holder_party_id")
      .leftJoin("locality", "locality.id", "client.locality_id")
      .leftJoin(
        "party as owner_party",
        "owner_party.id",
        "cylinder.owner_party_id",
      )
      .leftJoin("delivery_note", "delivery_note.id", "movement_event.remito_id")
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
        "delivery_note.remito_number",
        "movement_event.state",
        "movement_event.note",
        "movement_event.version",
        "movement_event.created_at",
        "cylinder.serial_number as cylinder_serial",
        "cylinder.capacity_m3",
        "cylinder.capacity_unit",
        "locality.name as locality_name",
        "cylinder.owner_party_id",
        "owner_party.display_name as owner_name",
      ]);

    if (query.open) {
      qb = qb
        .where("movement_event.state", "=", "OPEN")
        .where("movement_event.return_date", "is", null);
    }
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([
          eb("cylinder.serial_number", "ilike", term),
          eb("party.display_name", "ilike", term),
        ]),
      );
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
    if (query["filter[remito_id]"] != null) {
      qb = qb.where(
        "movement_event.remito_id",
        "=",
        query["filter[remito_id]"],
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorId = Number(cursor.id ?? 0);
      if (sort.field === "delivery_date") {
        const cursorDate = String(cursor.delivery_date ?? "");
        qb = asc
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
      } else if (sort.field === "return_date") {
        const cursorReturn = String(cursor.return_date ?? "");
        const returnKey = sql`coalesce(movement_event.return_date::text, '')`;
        qb = asc
          ? qb.where(
              sql<SqlBool>`(${returnKey} > ${cursorReturn} or (${returnKey} = ${cursorReturn} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(${returnKey} < ${cursorReturn} or (${returnKey} = ${cursorReturn} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "cylinder_serial") {
        const cursorSerial = String(cursor.cylinder_serial ?? "");
        qb = asc
          ? qb.where((eb) =>
              eb.or([
                eb("cylinder.serial_number", ">", cursorSerial),
                eb.and([
                  eb("cylinder.serial_number", "=", cursorSerial),
                  eb("movement_event.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("cylinder.serial_number", "<", cursorSerial),
                eb.and([
                  eb("cylinder.serial_number", "=", cursorSerial),
                  eb("movement_event.id", "<", cursorId),
                ]),
              ]),
            );
      } else if (sort.field === "holder_name") {
        const cursorHolder = String(cursor.holder_name ?? "");
        qb = asc
          ? qb.where(
              sql<SqlBool>`(party.display_name > ${cursorHolder} or (party.display_name = ${cursorHolder} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(party.display_name < ${cursorHolder} or (party.display_name = ${cursorHolder} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "property_basis") {
        const cursorBasis = String(cursor.property_basis ?? "");
        qb = asc
          ? qb.where(
              sql<SqlBool>`(movement_event.property_basis::text > ${cursorBasis} or (movement_event.property_basis::text = ${cursorBasis} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(movement_event.property_basis::text < ${cursorBasis} or (movement_event.property_basis::text = ${cursorBasis} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "movement_kind") {
        const cursorKind = String(cursor.movement_kind ?? "");
        qb = asc
          ? qb.where(
              sql<SqlBool>`(movement_event.movement_kind::text > ${cursorKind} or (movement_event.movement_kind::text = ${cursorKind} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(movement_event.movement_kind::text < ${cursorKind} or (movement_event.movement_kind::text = ${cursorKind} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "gas_code") {
        const cursorGas = String(cursor.gas_code ?? "");
        const gasKey = sql`coalesce(movement_event.gas_code, '')`;
        qb = asc
          ? qb.where(
              sql<SqlBool>`(${gasKey} > ${cursorGas} or (${gasKey} = ${cursorGas} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(${gasKey} < ${cursorGas} or (${gasKey} = ${cursorGas} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "rental_days") {
        const cursorDaysRaw = cursor.rental_days;
        const cursorDays =
          cursorDaysRaw == null || cursorDaysRaw === ""
            ? null
            : Number(cursorDaysRaw);
        const cursorKey =
          cursorDays == null ? (asc ? 2147483647 : -2147483648) : cursorDays;
        qb = asc
          ? qb.where(
              sql<SqlBool>`(${daysSortKey} > ${cursorKey} or (${daysSortKey} = ${cursorKey} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(${daysSortKey} < ${cursorKey} or (${daysSortKey} = ${cursorKey} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "state") {
        const cursorState = String(cursor.state ?? "");
        qb = asc
          ? qb.where(
              sql<SqlBool>`(movement_event.state::text > ${cursorState} or (movement_event.state::text = ${cursorState} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(movement_event.state::text < ${cursorState} or (movement_event.state::text = ${cursorState} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "capacity_m3") {
        const cursorCap =
          cursor.capacity_m3 == null || cursor.capacity_m3 === ""
            ? null
            : Number(cursor.capacity_m3);
        const capKey = sql`coalesce(cylinder.capacity_m3, -1)`;
        const cursorKey = cursorCap == null ? -1 : cursorCap;
        qb = asc
          ? qb.where(
              sql<SqlBool>`(${capKey} > ${cursorKey} or (${capKey} = ${cursorKey} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(${capKey} < ${cursorKey} or (${capKey} = ${cursorKey} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "locality_name") {
        const cursorLoc = String(cursor.locality_name ?? "");
        const locKey = sql`coalesce(locality.name, '')`;
        qb = asc
          ? qb.where(
              sql<SqlBool>`(${locKey} > ${cursorLoc} or (${locKey} = ${cursorLoc} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(${locKey} < ${cursorLoc} or (${locKey} = ${cursorLoc} and movement_event.id < ${cursorId}))`,
            );
      } else if (sort.field === "owner_name") {
        const cursorOwner = String(cursor.owner_name ?? "");
        const ownerKey = sql`coalesce(owner_party.display_name, '')`;
        qb = asc
          ? qb.where(
              sql<SqlBool>`(${ownerKey} > ${cursorOwner} or (${ownerKey} = ${cursorOwner} and movement_event.id > ${cursorId}))`,
            )
          : qb.where(
              sql<SqlBool>`(${ownerKey} < ${cursorOwner} or (${ownerKey} = ${cursorOwner} and movement_event.id < ${cursorId}))`,
            );
      }
    }

    const ordered =
      sort.field === "rental_days"
        ? qb
            .orderBy(daysSortKey, sort.direction)
            .orderBy("movement_event.id", sort.direction)
        : sort.field === "return_date"
          ? qb
              .orderBy(
                sql`coalesce(movement_event.return_date::text, '')`,
                sort.direction,
              )
              .orderBy("movement_event.id", sort.direction)
          : sort.field === "cylinder_serial"
            ? qb
                .orderBy("cylinder.serial_number", sort.direction)
                .orderBy("movement_event.id", sort.direction)
            : sort.field === "holder_name"
              ? qb
                  .orderBy("party.display_name", sort.direction)
                  .orderBy("movement_event.id", sort.direction)
              : sort.field === "property_basis"
                ? qb
                    .orderBy(
                      sql`movement_event.property_basis::text`,
                      sort.direction,
                    )
                    .orderBy("movement_event.id", sort.direction)
                : sort.field === "movement_kind"
                  ? qb
                      .orderBy(
                        sql`movement_event.movement_kind::text`,
                        sort.direction,
                      )
                      .orderBy("movement_event.id", sort.direction)
                  : sort.field === "gas_code"
                    ? qb
                        .orderBy(
                          sql`coalesce(movement_event.gas_code, '')`,
                          sort.direction,
                        )
                        .orderBy("movement_event.id", sort.direction)
                    : sort.field === "state"
                      ? qb
                          .orderBy(
                            sql`movement_event.state::text`,
                            sort.direction,
                          )
                          .orderBy("movement_event.id", sort.direction)
                      : sort.field === "capacity_m3"
                        ? qb
                            .orderBy(
                              sql`coalesce(cylinder.capacity_m3, -1)`,
                              sort.direction,
                            )
                            .orderBy("movement_event.id", sort.direction)
                        : sort.field === "locality_name"
                          ? qb
                              .orderBy(
                                sql`coalesce(locality.name, '')`,
                                sort.direction,
                              )
                              .orderBy("movement_event.id", sort.direction)
                          : sort.field === "owner_name"
                            ? qb
                                .orderBy(
                                  sql`coalesce(owner_party.display_name, '')`,
                                  sort.direction,
                                )
                                .orderBy("movement_event.id", sort.direction)
                            : qb
                                .orderBy(
                                  "movement_event.delivery_date",
                                  sort.direction,
                                )
                                .orderBy("movement_event.id", sort.direction);

    const [rows, totalEstimate] = await Promise.all([
      ordered.limit(limit + 1).execute() as Promise<MovementRow[]>,
      this.countMatching(query),
    ]);

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
            ? encodeCursor(
                movementListCursorPayload(
                  sort.field as (typeof MOVEMENT_LIST_SORT_FIELDS)[number],
                  last,
                  asOf,
                ),
              )
            : null,
        totalEstimate,
      }),
    };
  }

  /** Exact match count for the current list filters (no cursor). Feeds DataGrid totals. */
  private async countMatching(query: MovementListQuery): Promise<number> {
    const db = resolveDb(this.db);
    let qb = db
      .selectFrom("movement_event")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .leftJoin("client", "client.party_id", "movement_event.holder_party_id")
      .select((eb) => eb.fn.countAll<string>().as("c"));

    if (query.open) {
      qb = qb
        .where("movement_event.state", "=", "OPEN")
        .where("movement_event.return_date", "is", null);
    }
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([
          eb("cylinder.serial_number", "ilike", term),
          eb("party.display_name", "ilike", term),
        ]),
      );
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
    if (query["filter[remito_id]"] != null) {
      qb = qb.where(
        "movement_event.remito_id",
        "=",
        query["filter[remito_id]"],
      );
    }

    const row = await qb.executeTakeFirst();
    return Number(row?.c ?? 0);
  }

  async getById(id: number): Promise<MovementEvent | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("movement_event")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .leftJoin("client", "client.party_id", "movement_event.holder_party_id")
      .leftJoin("locality", "locality.id", "client.locality_id")
      .leftJoin(
        "party as owner_party",
        "owner_party.id",
        "cylinder.owner_party_id",
      )
      .leftJoin("delivery_note", "delivery_note.id", "movement_event.remito_id")
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
        "delivery_note.remito_number",
        "movement_event.state",
        "movement_event.note",
        "movement_event.version",
        "movement_event.created_at",
        "cylinder.serial_number as cylinder_serial",
        "cylinder.capacity_m3",
        "cylinder.capacity_unit",
        "locality.name as locality_name",
        "cylinder.owner_party_id",
        "owner_party.display_name as owner_name",
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
        "capacity_m3",
        "capacity_unit",
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
          capacity_m3: row.capacity_m3 == null ? null : Number(row.capacity_m3),
          capacity_unit: row.capacity_unit ?? "M3",
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

    const remitoId = await this.resolveOrAllocateRemito(db, input);

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
        remito_id: remitoId,
        note: input.note ?? null,
        state: "OPEN",
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const movementId = Number(inserted.id);

    // Remito Aggregate close path passes remito_id and already has lines.
    // Movement-first creates need a cylinder line snapshot on the remito.
    if (input.remito_id == null) {
      await ensureRemitoCylinderLine(db, {
        remitoId,
        cylinderId: input.cylinder_id,
        movementEventId: movementId,
        movementKind: input.movement_kind,
        gasCode,
        propertyBasis,
      });
    }

    await db
      .updateTable("cylinder")
      .set({
        state: "AT_CLIENT",
        condition: "FULL",
        updated_by: actorUserId,
      })
      .where("id", "=", input.cylinder_id)
      .execute();

    const created = await this.getById(movementId);
    if (!created) throw ApiErrors.notFound("Movement not found after create");
    return created;
  }

  /**
   * Sell one of our cylinders: post a terminal SOLD movement (no return),
   * record `cylinder_sale` (billable), and mark the cylinder SOLD.
   */
  async createSale(
    input: CreateMovementInput,
    cylinder: CylinderForDelivery,
    gasCode: string | null,
    actorUserId: number,
  ): Promise<MovementEvent> {
    const db = resolveDb(this.db);
    const salePrice = input.sale_price;
    if (salePrice == null || !(salePrice > 0)) {
      throw ApiErrors.validationFailed("Sale price is required", [
        { field: "sale_price", issue: "Required for sale" },
      ]);
    }

    const remitoId = await this.resolveOrAllocateRemito(db, input);
    const propertyBasis = cylinder.ownership_basis;

    const inserted = await db
      .insertInto("movement_event")
      .values({
        ...(input.request_id ? { request_id: input.request_id } : {}),
        cylinder_id: input.cylinder_id,
        holder_party_id: input.holder_party_id,
        movement_kind: "SALE",
        property_basis: propertyBasis,
        gas_code: gasCode,
        delivery_date: input.delivery_date,
        return_date: null,
        origin_party_id: input.origin_party_id ?? null,
        remito_id: remitoId,
        note: input.note ?? null,
        state: "SOLD",
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const movementId = Number(inserted.id);

    if (input.remito_id == null) {
      await ensureRemitoCylinderLine(db, {
        remitoId,
        cylinderId: input.cylinder_id,
        movementEventId: movementId,
        movementKind: "SALE",
        gasCode,
        propertyBasis,
      });
    }

    await db
      .insertInto("cylinder_sale")
      .values({
        cylinder_id: input.cylinder_id,
        client_party_id: input.holder_party_id,
        sale_date: input.delivery_date,
        gas_code: gasCode,
        capacity_m3: cylinder.capacity_m3,
        capacity_unit: cylinder.capacity_unit,
        price: salePrice,
        note: input.note ?? null,
        created_by: actorUserId,
      })
      .execute();

    await db
      .updateTable("cylinder")
      .set({
        state: "SOLD",
        updated_by: actorUserId,
      })
      .where("id", "=", input.cylinder_id)
      .execute();

    const created = await this.getById(movementId);
    if (!created) throw ApiErrors.notFound("Movement not found after sale");
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
   * Close a REFILL / Su Propiedad cycle: customer keeps the cylinder (AT_CLIENT
   * FULL). Distinct from closeReturn which puts our stock back IN_STOCK_EMPTY.
   */
  async closeRefill(
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
        state: "AT_CLIENT",
        condition: "FULL",
        updated_by: actorUserId,
      })
      .where("id", "=", cylinderId)
      .execute();

    const closed = await this.getById(movementId);
    if (!closed) {
      throw ApiErrors.notFound("Movement not found after refill close");
    }
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
    options?: { restoreSold?: boolean },
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

    if (wasOpen || options?.restoreSold) {
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

    // Sale ledger has no VOID state; drop the unbilled row so the unit can
    // be sold again and does not keep appearing on billing runs.
    if (options?.restoreSold) {
      await db
        .deleteFrom("cylinder_sale")
        .where("cylinder_id", "=", cylinderId)
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

  /**
   * Create the missing `cylinder_sale` for a SALE that was posted without a
   * price (so billing can pick it up).
   */
  async recordSalePrice(
    movementId: number,
    movement: MovementEvent,
    salePrice: number,
    actorUserId: number,
  ): Promise<MovementEvent> {
    const db = resolveDb(this.db);
    const existing = await db
      .selectFrom("cylinder_sale")
      .select("id")
      .where("cylinder_id", "=", movement.cylinder_id)
      .where("client_party_id", "=", movement.holder_party_id)
      .where("sale_date", "=", movement.delivery_date)
      .executeTakeFirst();
    if (existing) {
      throw ApiErrors.conflict(
        "SALE_PRICE_EXISTS",
        "This sale already has a recorded price",
      );
    }

    const cylinder = await db
      .selectFrom("cylinder")
      .select(["capacity_m3", "capacity_unit"])
      .where("id", "=", movement.cylinder_id)
      .executeTakeFirst();
    if (!cylinder) throw ApiErrors.notFound("Cylinder not found");

    await db
      .insertInto("cylinder_sale")
      .values({
        cylinder_id: movement.cylinder_id,
        client_party_id: movement.holder_party_id,
        sale_date: movement.delivery_date,
        gas_code: movement.gas_code,
        capacity_m3: cylinder.capacity_m3,
        capacity_unit: cylinder.capacity_unit ?? "M3",
        price: salePrice,
        created_by: actorUserId,
      })
      .execute();

    const refreshed = await this.getById(movementId);
    if (!refreshed) throw ApiErrors.notFound("Movement not found after update");
    return refreshed;
  }

  /**
   * Prefer explicit remito_id, else find-or-create by remito_number, else
   * allocate the next unique series number (A-########).
   */
  private async resolveOrAllocateRemito(
    db: Kysely<Database>,
    input: CreateMovementInput,
  ): Promise<number> {
    if (input.remito_id != null) return input.remito_id;
    const explicit = input.remito_number?.trim();
    if (explicit) {
      const resolved = await resolveDeliveryNote(db, {
        remito_number: explicit,
        issued_date: input.delivery_date,
        client_party_id: input.holder_party_id,
      });
      if (resolved == null) {
        throw ApiErrors.validationFailed("Remito number is required", [
          { field: "remito_number", issue: "Must not be blank" },
        ]);
      }
      return resolved;
    }
    return allocateClosedDeliveryNote(db, {
      issued_date: input.delivery_date,
      client_party_id: input.holder_party_id,
    });
  }
}

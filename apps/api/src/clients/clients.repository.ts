import { Inject, Injectable } from "@nestjs/common";
import { businessTodayIso, calendarDaysBetween } from "@weld/domain";
import type {
  Client,
  ClientAccountQuery,
  ClientAccountResponse,
  ClientListQuery,
  CreateClientInput,
  MovementEvent,
  RoleCode,
  UpdateClientInput,
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
import { canViewMunicipalHospitalClients } from "../auth/principal";
import type {
  ClientCoverage,
  ClientSegment,
  ClientStatus,
  MovementKind,
  MovementState,
  OwnershipBasis,
} from "../database/schema.types";

interface ClientRow {
  party_id: number;
  display_name: string;
  cuit: string | null;
  cuit_valid: boolean;
  address_street: string | null;
  locality_id: number | null;
  territory_id: number | null;
  coverage: ClientCoverage;
  segment: ClientSegment | null;
  delivery_instructions: string | null;
  daily_rate_default: string | null;
  status: ClientStatus;
  version: number;
  created_at: Date;
}

interface AccountMovementRow {
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

function toIsoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapAccountMovement(row: AccountMovementRow): MovementEvent {
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
export class ClientsRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(input: {
    query: ClientListQuery;
    territoryIds: number[] | null;
    roles: RoleCode[];
  }): Promise<{ data: Client[]; page: ReturnType<typeof buildPageMeta> }> {
    const db = resolveDb(this.db);
    const limit = input.query.limit;
    const sort = parseSort(input.query.sort, [
      "name",
      "created_at",
      "territory_id",
    ]);

    let qb = db
      .selectFrom("client")
      .innerJoin("party", "party.id", "client.party_id")
      .select([
        "client.party_id as party_id",
        "party.display_name as display_name",
        "client.cuit",
        "client.cuit_valid",
        "client.address_street",
        "client.locality_id",
        "client.territory_id",
        "client.coverage",
        "client.segment",
        "client.delivery_instructions",
        "client.daily_rate_default",
        "client.status",
        "client.version",
        "client.created_at",
      ])
      .where("client.deleted_at", "is", null)
      .where("party.deleted_at", "is", null);

    if (input.territoryIds) {
      qb = qb.where("client.territory_id", "in", input.territoryIds);
    }

    if (!canViewMunicipalHospitalClients(input.roles)) {
      qb = qb.where("client.coverage", "<>", "MUNICIPAL_HOSPITAL");
    }

    if (input.query.q) {
      const term = `%${input.query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([
          eb("party.display_name", "ilike", term),
          eb("client.cuit", "ilike", term),
        ]),
      );
    }

    const localityFilter = input.query["filter[locality_id]"];
    if (localityFilter != null) {
      qb = qb.where("client.locality_id", "=", localityFilter);
    }
    const territoryFilter = input.query["filter[territory_id]"];
    if (territoryFilter != null && localityFilter == null) {
      qb = qb.where("client.territory_id", "=", territoryFilter);
    }
    if (input.query["filter[coverage]"]) {
      qb = qb.where("client.coverage", "=", input.query["filter[coverage]"]);
    }
    if (input.query["filter[segment]"]) {
      qb = qb.where("client.segment", "=", input.query["filter[segment]"]);
    }
    if (input.query["filter[status]"]) {
      qb = qb.where("client.status", "=", input.query["filter[status]"]);
    }

    if (input.query.cursor) {
      const cursor = decodeCursor(input.query.cursor);
      const cursorName = String(cursor.name ?? "");
      const cursorId = Number(cursor.id ?? 0);
      if (sort.field === "name") {
        qb =
          sort.direction === "asc"
            ? qb.where((eb) =>
                eb.or([
                  eb("party.display_name", ">", cursorName),
                  eb.and([
                    eb("party.display_name", "=", cursorName),
                    eb("client.party_id", ">", cursorId),
                  ]),
                ]),
              )
            : qb.where((eb) =>
                eb.or([
                  eb("party.display_name", "<", cursorName),
                  eb.and([
                    eb("party.display_name", "=", cursorName),
                    eb("client.party_id", "<", cursorId),
                  ]),
                ]),
              );
      }
    }

    const sortColumn =
      sort.field === "name"
        ? "party.display_name"
        : sort.field === "created_at"
          ? "client.created_at"
          : "client.territory_id";

    const rows = await qb
      .orderBy(sortColumn, sort.direction)
      .orderBy("client.party_id", sort.direction)
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) => this.mapRow(row)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                name: last.display_name,
                id: Number(last.party_id),
              })
            : null,
      }),
    };
  }

  async getById(input: {
    id: number;
    territoryIds: number[] | null;
    roles: RoleCode[];
  }): Promise<Client | null> {
    const db = resolveDb(this.db);
    let qb = db
      .selectFrom("client")
      .innerJoin("party", "party.id", "client.party_id")
      .select([
        "client.party_id as party_id",
        "party.display_name as display_name",
        "client.cuit",
        "client.cuit_valid",
        "client.address_street",
        "client.locality_id",
        "client.territory_id",
        "client.coverage",
        "client.segment",
        "client.delivery_instructions",
        "client.daily_rate_default",
        "client.status",
        "client.version",
        "client.created_at",
      ])
      .where("client.party_id", "=", input.id)
      .where("client.deleted_at", "is", null)
      .where("party.deleted_at", "is", null);

    if (input.territoryIds) {
      qb = qb.where("client.territory_id", "in", input.territoryIds);
    }

    if (!canViewMunicipalHospitalClients(input.roles)) {
      qb = qb.where("client.coverage", "<>", "MUNICIPAL_HOSPITAL");
    }

    const row = await qb.executeTakeFirst();
    if (!row || row.territory_id == null) {
      return null;
    }

    const contacts = await db
      .selectFrom("client_contact")
      .select(["id", "name", "phone", "role", "is_primary"])
      .where("client_party_id", "=", input.id)
      .execute();

    const outstandingCount = await this.countOpenMovements(input.id);
    const openAccessoryCount = await this.countOpenAccessories(input.id);

    const client = this.mapRow(row);
    return {
      ...client,
      contacts: contacts.map((contact) => ({
        id: Number(contact.id),
        name: contact.name,
        phone: contact.phone,
        role: contact.role,
        is_primary: contact.is_primary,
      })),
      outstanding_count: outstandingCount,
      open_accessory_count: openAccessoryCount,
    };
  }

  async getAccount(input: {
    id: number;
    query: ClientAccountQuery;
    territoryIds: number[] | null;
    roles: RoleCode[];
  }): Promise<ClientAccountResponse | null> {
    const client = await this.getById({
      id: input.id,
      territoryIds: input.territoryIds,
      roles: input.roles,
    });
    if (!client) return null;

    const db = resolveDb(this.db);
    const asOf = businessTodayIso();
    const limit = input.query.limit;
    const sort = parseSort(input.query.sort, ["delivery_date"]);

    const openRows = await db
      .selectFrom("movement_event")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .select([
        "movement_event.id",
        "movement_event.cylinder_id",
        "cylinder.serial_number",
        "movement_event.gas_code",
        "movement_event.movement_kind",
        "movement_event.delivery_date",
      ])
      .where("movement_event.holder_party_id", "=", input.id)
      .where("movement_event.state", "=", "OPEN")
      .where("movement_event.return_date", "is", null)
      .orderBy("movement_event.delivery_date", "asc")
      .orderBy("movement_event.id", "asc")
      .execute();

    const outstanding = openRows.map((row) => {
      const delivery = toIsoDate(row.delivery_date)!;
      return {
        movement_id: Number(row.id),
        cylinder_id: Number(row.cylinder_id),
        serial: row.serial_number,
        gas_code: row.gas_code as MovementEvent["gas_code"],
        movement_kind: row.movement_kind,
        delivery_date: delivery,
        accrued_days: calendarDaysBetween(delivery, asOf),
      };
    });

    const byGasMap = new Map<string, number>();
    let openRental = 0;
    let openRefill = 0;
    for (const row of outstanding) {
      if (row.movement_kind === "RENTAL") openRental += 1;
      else openRefill += 1;
      const key = row.gas_code ?? "";
      byGasMap.set(key, (byGasMap.get(key) ?? 0) + 1);
    }

    const periodStart = new Date(`${asOf}T00:00:00Z`);
    periodStart.setUTCDate(periodStart.getUTCDate() - 30);
    const periodStartIso = periodStart.toISOString().slice(0, 10);

    const closedDaysRow = await db
      .selectFrom("movement_event")
      .select((eb) => eb.fn.sum<string>("rental_days").as("total_days"))
      .where("holder_party_id", "=", input.id)
      .where("state", "=", "CLOSED")
      .where("return_date", ">=", periodStartIso)
      .where("return_date", "<=", asOf)
      .executeTakeFirst();

    const rental_summary = {
      open_count: outstanding.length,
      open_rental_count: openRental,
      open_refill_count: openRefill,
      closed_days_last_period: Number(closedDaysRow?.total_days ?? 0),
      by_gas: [...byGasMap.entries()].map(([gas, count]) => ({
        gas_code: (gas || null) as MovementEvent["gas_code"],
        count,
      })),
    };

    let qb = db
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
      .where("movement_event.holder_party_id", "=", input.id);

    if (input.query.open) {
      qb = qb
        .where("movement_event.state", "=", "OPEN")
        .where("movement_event.return_date", "is", null);
    }
    if (input.query["filter[kind]"]) {
      qb = qb.where(
        "movement_event.movement_kind",
        "=",
        input.query["filter[kind]"],
      );
    }
    if (input.query["filter[delivery_date][gte]"]) {
      qb = qb.where(
        "movement_event.delivery_date",
        ">=",
        input.query["filter[delivery_date][gte]"],
      );
    }
    if (input.query["filter[delivery_date][lte]"]) {
      qb = qb.where(
        "movement_event.delivery_date",
        "<=",
        input.query["filter[delivery_date][lte]"],
      );
    }

    if (input.query.cursor) {
      const cursor = decodeCursor(input.query.cursor);
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

    const rows = (await qb
      .orderBy("movement_event.delivery_date", sort.direction)
      .orderBy("movement_event.id", sort.direction)
      .limit(limit + 1)
      .execute()) as AccountMovementRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      client_id: input.id,
      outstanding,
      rental_summary,
      data: pageRows.map(mapAccountMovement),
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

  async create(input: CreateClientInput, actorUserId: number): Promise<Client> {
    const db = resolveDb(this.db);

    if (input.cuit) {
      const existing = await db
        .selectFrom("client")
        .select("party_id")
        .where("cuit", "=", input.cuit)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (existing) {
        throw ApiErrors.duplicateCuit();
      }
    }

    const cuitValid = input.cuit ? true : false;

    const party = await db
      .insertInto("party")
      .values({
        party_type: "CUSTOMER",
        display_name: input.name,
        is_self: false,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    try {
      await db
        .insertInto("client")
        .values({
          party_id: party.id,
          legal_name: input.name,
          cuit: input.cuit ?? null,
          cuit_valid: cuitValid,
          address_street: input.address_street ?? null,
          locality_id: input.locality_id ?? null,
          territory_id: input.territory_id,
          coverage: input.coverage,
          segment: input.segment ?? null,
          delivery_instructions: input.delivery_instructions ?? null,
          daily_rate_default:
            input.daily_rate_default != null
              ? String(input.daily_rate_default)
              : null,
          status: "ACTIVE",
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .execute();
    } catch (error) {
      if (isUniqueViolation(error, "uq_client_cuit")) {
        throw ApiErrors.duplicateCuit();
      }
      throw error;
    }

    if (input.contacts.length > 0) {
      await db
        .insertInto("client_contact")
        .values(
          input.contacts.map((contact) => ({
            client_party_id: party.id,
            name: contact.name ?? null,
            phone: contact.phone ?? null,
            role: contact.role ?? null,
            is_primary: contact.is_primary ?? false,
          })),
        )
        .execute();
    }

    const created = await this.getById({
      id: Number(party.id),
      territoryIds: null,
      roles: ["ADMIN"],
    });
    if (!created) {
      throw ApiErrors.conflict(
        "CREATE_FAILED",
        "Failed to load created client",
      );
    }
    return created;
  }

  async update(
    id: number,
    input: UpdateClientInput,
    actorUserId: number,
    expectedVersion: number,
  ): Promise<Client> {
    const db = resolveDb(this.db);

    if (input.cuit !== undefined && input.cuit != null) {
      const existing = await db
        .selectFrom("client")
        .select("party_id")
        .where("cuit", "=", input.cuit)
        .where("party_id", "<>", id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (existing) {
        throw ApiErrors.duplicateCuit();
      }
    }

    if (input.name !== undefined) {
      const partyUpdated = await db
        .updateTable("party")
        .set({
          display_name: input.name,
          updated_by: actorUserId,
        })
        .where("id", "=", id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (Number(partyUpdated.numUpdatedRows ?? 0) === 0) {
        throw ApiErrors.notFound("Client not found");
      }
    }

    const patch: {
      legal_name?: string;
      cuit?: string | null;
      cuit_valid?: boolean;
      address_street?: string | null;
      locality_id?: number | null;
      territory_id?: number;
      coverage?: ClientCoverage;
      segment?: ClientSegment | null;
      delivery_instructions?: string | null;
      daily_rate_default?: string | null;
      status?: ClientStatus;
      updated_by: number;
      version: number;
    } = {
      updated_by: actorUserId,
      version: expectedVersion + 1,
    };

    if (input.name !== undefined) patch.legal_name = input.name;
    if (input.cuit !== undefined) {
      patch.cuit = input.cuit;
      patch.cuit_valid = input.cuit != null;
    }
    if (input.address_street !== undefined) {
      patch.address_street = input.address_street;
    }
    if (input.locality_id !== undefined) patch.locality_id = input.locality_id;
    if (input.territory_id !== undefined) {
      patch.territory_id = input.territory_id;
    }
    if (input.coverage !== undefined) patch.coverage = input.coverage;
    if (input.segment !== undefined) patch.segment = input.segment;
    if (input.delivery_instructions !== undefined) {
      patch.delivery_instructions = input.delivery_instructions;
    }
    if (input.daily_rate_default !== undefined) {
      patch.daily_rate_default =
        input.daily_rate_default != null
          ? String(input.daily_rate_default)
          : null;
    }
    if (input.status !== undefined) patch.status = input.status;

    try {
      const updated = await db
        .updateTable("client")
        .set(patch)
        .where("party_id", "=", id)
        .where("version", "=", expectedVersion)
        .where("deleted_at", "is", null)
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows ?? 0) === 0) {
        throw ApiErrors.conflict("VERSION_CONFLICT", "Client version conflict");
      }
    } catch (error) {
      if (isUniqueViolation(error, "uq_client_cuit")) {
        throw ApiErrors.duplicateCuit();
      }
      throw error;
    }

    if (input.contacts !== undefined) {
      await db
        .deleteFrom("client_contact")
        .where("client_party_id", "=", id)
        .execute();

      if (input.contacts.length > 0) {
        await db
          .insertInto("client_contact")
          .values(
            input.contacts.map((contact) => ({
              client_party_id: id,
              name: contact.name ?? null,
              phone: contact.phone ?? null,
              role: contact.role ?? null,
              is_primary: contact.is_primary ?? false,
            })),
          )
          .execute();
      }
    }

    const result = await this.getById({
      id,
      territoryIds: null,
      roles: ["ADMIN"],
    });
    if (!result) {
      throw ApiErrors.notFound("Client not found");
    }
    return result;
  }

  private async countOpenMovements(clientPartyId: number): Promise<number> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("movement_event")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("holder_party_id", "=", clientPartyId)
      .where("state", "=", "OPEN")
      .where("return_date", "is", null)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  private async countOpenAccessories(clientPartyId: number): Promise<number> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("accessory_rental")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("client_party_id", "=", clientPartyId)
      .where("state", "=", "ON_LOAN")
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  private mapRow(row: ClientRow): Client {
    if (row.territory_id == null) {
      throw ApiErrors.validationFailed("Client is missing territory_id");
    }

    return {
      id: Number(row.party_id),
      name: row.display_name,
      cuit: row.cuit,
      cuit_valid: row.cuit_valid,
      address_street: row.address_street,
      locality_id: row.locality_id != null ? Number(row.locality_id) : null,
      territory_id: Number(row.territory_id),
      coverage: row.coverage,
      segment: row.segment,
      delivery_instructions: row.delivery_instructions,
      daily_rate_default:
        row.daily_rate_default != null ? Number(row.daily_rate_default) : null,
      status: row.status,
      version: row.version,
      created_at: row.created_at.toISOString(),
    };
  }
}

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const pgError = error as { code?: string; constraint?: string };
  return (
    pgError.code === "23505" &&
    (constraint == null || pgError.constraint === constraint)
  );
}

import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateLocalityInput,
  CreateTerritoryInput,
  Locality,
  LocalityListQuery,
  Territory,
  TerritoryListQuery,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

@Injectable()
export class MastersRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async listTerritories(query: TerritoryListQuery): Promise<{
    data: Territory[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;

    let qb = db
      .selectFrom("dispatch_territory")
      .select(["id", "name", "is_active"])
      .orderBy("name", "asc")
      .orderBy("id", "asc");

    if (query.q) {
      qb = qb.where("name", "ilike", `%${query.q}%`);
    }
    if (query["filter[is_active]"] != null) {
      qb = qb.where("is_active", "=", query["filter[is_active]"] === "true");
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorName = String(cursor.name ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb = qb.where((eb) =>
        eb.or([
          eb("name", ">", cursorName),
          eb.and([eb("name", "=", cursorName), eb("id", ">", cursorId)]),
        ]),
      );
    }

    const rows = await qb.limit(limit + 1).execute();
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        is_active: row.is_active,
      })),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ name: last.name, id: Number(last.id) })
            : null,
      }),
    };
  }

  async createTerritory(input: CreateTerritoryInput): Promise<Territory> {
    const db = resolveDb(this.db);
    try {
      const row = await db
        .insertInto("dispatch_territory")
        .values({ name: input.name, is_active: true })
        .returning(["id", "name", "is_active"])
        .executeTakeFirstOrThrow();
      return {
        id: Number(row.id),
        name: row.name,
        is_active: row.is_active,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "DUPLICATE_TERRITORY",
          "A territory with this name already exists",
        );
      }
      throw error;
    }
  }

  async listLocalities(query: LocalityListQuery): Promise<{
    data: Locality[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;

    let qb = db
      .selectFrom("locality")
      .leftJoin(
        "dispatch_territory",
        "dispatch_territory.id",
        "locality.territory_id",
      )
      .select([
        "locality.id",
        "locality.name",
        "locality.province",
        "locality.territory_id",
        "dispatch_territory.name as territory_name",
      ])
      .select((eb) =>
        eb
          .selectFrom("client")
          .select((eb2) => eb2.fn.countAll<string>().as("cnt"))
          .whereRef("client.locality_id", "=", "locality.id")
          .where("client.deleted_at", "is", null)
          .as("client_count"),
      )
      .select((eb) =>
        eb
          .selectFrom("movement_event")
          .innerJoin(
            "client",
            "client.party_id",
            "movement_event.holder_party_id",
          )
          .select((eb2) => eb2.fn.countAll<string>().as("cnt"))
          .whereRef("client.locality_id", "=", "locality.id")
          .where("movement_event.state", "=", "OPEN")
          .where("movement_event.return_date", "is", null)
          .where("client.deleted_at", "is", null)
          .as("cylinder_count"),
      )
      .orderBy("locality.name", "asc")
      .orderBy("locality.id", "asc");

    if (query.q) {
      qb = qb.where("locality.name", "ilike", `%${query.q}%`);
    }
    if (query["filter[territory_id]"] != null) {
      qb = qb.where(
        "locality.territory_id",
        "=",
        query["filter[territory_id]"],
      );
    }
    if (query["filter[has_clients]"] === "true") {
      qb = qb.where((eb) =>
        eb.exists(
          eb
            .selectFrom("client")
            .select("client.party_id")
            .whereRef("client.locality_id", "=", "locality.id")
            .where("client.deleted_at", "is", null),
        ),
      );
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorName = String(cursor.name ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb = qb.where((eb) =>
        eb.or([
          eb("locality.name", ">", cursorName),
          eb.and([
            eb("locality.name", "=", cursorName),
            eb("locality.id", ">", cursorId),
          ]),
        ]),
      );
    }

    const rows = await qb.limit(limit + 1).execute();
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        province: row.province,
        territory_id:
          row.territory_id == null ? null : Number(row.territory_id),
        territory_name: row.territory_name ?? null,
        client_count: row.client_count == null ? 0 : Number(row.client_count),
        cylinder_count:
          row.cylinder_count == null ? 0 : Number(row.cylinder_count),
      })),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ name: last.name, id: Number(last.id) })
            : null,
      }),
    };
  }

  async createLocality(input: CreateLocalityInput): Promise<Locality> {
    const db = resolveDb(this.db);
    if (input.territory_id != null) {
      const territory = await db
        .selectFrom("dispatch_territory")
        .select("id")
        .where("id", "=", input.territory_id)
        .executeTakeFirst();
      if (!territory) {
        throw ApiErrors.validationFailed("Unknown territory_id", [
          { field: "territory_id", issue: "not_found" },
        ]);
      }
    }

    try {
      const row = await db
        .insertInto("locality")
        .values({
          name: input.name,
          province: input.province,
          territory_id: input.territory_id ?? null,
        })
        .returning(["id", "name", "province", "territory_id"])
        .executeTakeFirstOrThrow();

      let territoryName: string | null = null;
      if (row.territory_id != null) {
        const territory = await db
          .selectFrom("dispatch_territory")
          .select("name")
          .where("id", "=", Number(row.territory_id))
          .executeTakeFirst();
        territoryName = territory?.name ?? null;
      }

      return {
        id: Number(row.id),
        name: row.name,
        province: row.province,
        territory_id:
          row.territory_id == null ? null : Number(row.territory_id),
        territory_name: territoryName,
        client_count: 0,
        cylinder_count: 0,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "DUPLICATE_LOCALITY",
          "A locality with this name already exists in the province",
        );
      }
      throw error;
    }
  }
}

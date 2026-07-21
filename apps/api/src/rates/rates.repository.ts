import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateRentalRateInput,
  RentalRate,
  RentalRateListQuery,
  UpdateRentalRateInput,
} from "@weld/schemas";
import { ratesOverlap } from "@weld/domain";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import type { RatePeriod } from "../database/schema.types";

interface RateRow {
  id: number;
  client_party_id: number | null;
  client_name: string | null;
  gas_code: string | null;
  period: RatePeriod;
  amount: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
}

function toIsoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapRate(row: RateRow): RentalRate {
  return {
    id: Number(row.id),
    client_party_id:
      row.client_party_id == null ? null : Number(row.client_party_id),
    client_name: row.client_name,
    gas_code: row.gas_code as RentalRate["gas_code"],
    period: row.period,
    amount: Number(row.amount),
    effective_from: toIsoDate(row.effective_from)!,
    effective_to: toIsoDate(row.effective_to),
  };
}

@Injectable()
export class RatesRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: RentalRateListQuery): Promise<{
    data: RentalRate[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["effective_from"]);

    let qb = db
      .selectFrom("rental_rate")
      .leftJoin("party", "party.id", "rental_rate.client_party_id")
      .select([
        "rental_rate.id",
        "rental_rate.client_party_id",
        "party.display_name as client_name",
        "rental_rate.gas_code",
        "rental_rate.period",
        "rental_rate.amount",
        "rental_rate.effective_from",
        "rental_rate.effective_to",
      ]);

    if (query["filter[client_party_id]"] != null) {
      qb = qb.where(
        "rental_rate.client_party_id",
        "=",
        query["filter[client_party_id]"],
      );
    }
    if (query["filter[gas_code]"]) {
      qb = qb.where("rental_rate.gas_code", "=", query["filter[gas_code]"]);
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = String(cursor.effective_from ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("rental_rate.effective_from", ">", cursorDate),
                eb.and([
                  eb("rental_rate.effective_from", "=", cursorDate),
                  eb("rental_rate.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("rental_rate.effective_from", "<", cursorDate),
                eb.and([
                  eb("rental_rate.effective_from", "=", cursorDate),
                  eb("rental_rate.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = (await qb
      .orderBy("rental_rate.effective_from", sort.direction)
      .orderBy("rental_rate.id", sort.direction)
      .limit(limit + 1)
      .execute()) as RateRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map(mapRate),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                effective_from: toIsoDate(last.effective_from),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getById(id: number): Promise<RentalRate> {
    const row = await this.fetchMapped(id);
    if (!row) throw ApiErrors.notFound("Rate not found");
    return row;
  }

  async listAllCandidates(): Promise<
    Array<{
      id: number;
      client_party_id: number | null;
      gas_code: string | null;
      period: RatePeriod;
      amount: number;
      effective_from: string;
      effective_to: string | null;
    }>
  > {
    const db = resolveDb(this.db);
    const rows = await db.selectFrom("rental_rate").selectAll().execute();
    return rows.map((row) => ({
      id: Number(row.id),
      client_party_id:
        row.client_party_id == null ? null : Number(row.client_party_id),
      gas_code: row.gas_code,
      period: row.period,
      amount: Number(row.amount),
      effective_from: toIsoDate(row.effective_from as string | Date)!,
      effective_to: toIsoDate(row.effective_to as string | Date | null),
    }));
  }

  async create(input: CreateRentalRateInput): Promise<RentalRate> {
    const db = resolveDb(this.db);
    const clientId = input.client_party_id ?? null;
    const gasCode = input.gas_code ?? null;
    const effectiveTo = input.effective_to ?? null;

    await this.assertNoOverlap({
      excludeId: null,
      clientId,
      gasCode,
      effectiveFrom: input.effective_from,
      effectiveTo,
    });

    const inserted = await db
      .insertInto("rental_rate")
      .values({
        client_party_id: clientId,
        gas_code: gasCode,
        period: input.period,
        amount: String(input.amount),
        effective_from: input.effective_from,
        effective_to: effectiveTo,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return this.getById(Number(inserted.id));
  }

  async update(id: number, input: UpdateRentalRateInput): Promise<RentalRate> {
    const db = resolveDb(this.db);
    const existing = await this.getById(id);

    const clientId =
      input.client_party_id !== undefined
        ? input.client_party_id
        : existing.client_party_id;
    const gasCode =
      input.gas_code !== undefined ? input.gas_code : existing.gas_code;
    const effectiveFrom = input.effective_from ?? existing.effective_from;
    const effectiveTo =
      input.effective_to !== undefined
        ? input.effective_to
        : existing.effective_to;
    const period = input.period ?? existing.period;
    const amount = input.amount ?? existing.amount;

    await this.assertNoOverlap({
      excludeId: id,
      clientId,
      gasCode,
      effectiveFrom,
      effectiveTo,
    });

    const updated = await db
      .updateTable("rental_rate")
      .set({
        client_party_id: clientId,
        gas_code: gasCode,
        period,
        amount: String(amount),
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      })
      .where("id", "=", id)
      .returning("id")
      .executeTakeFirst();

    if (!updated) throw ApiErrors.notFound("Rate not found");
    return this.getById(id);
  }

  private async assertNoOverlap(params: {
    excludeId: number | null;
    clientId: number | null;
    gasCode: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
  }): Promise<void> {
    const db = resolveDb(this.db);
    let qb = db
      .selectFrom("rental_rate")
      .select(["id", "effective_from", "effective_to"])
      .where((eb) =>
        params.clientId == null
          ? eb("client_party_id", "is", null)
          : eb("client_party_id", "=", params.clientId),
      )
      .where((eb) =>
        params.gasCode == null
          ? eb("gas_code", "is", null)
          : eb("gas_code", "=", params.gasCode),
      );

    if (params.excludeId != null) {
      qb = qb.where("id", "!=", params.excludeId);
    }

    const peers = await qb.execute();
    const incoming = {
      effective_from: params.effectiveFrom,
      effective_to: params.effectiveTo,
    };
    for (const peer of peers) {
      if (
        ratesOverlap(incoming, {
          effective_from: toIsoDate(peer.effective_from as string | Date)!,
          effective_to: toIsoDate(peer.effective_to as string | Date | null),
        })
      ) {
        throw ApiErrors.conflict(
          "RATE_OVERLAP",
          "Overlapping rate for the same client/gas",
        );
      }
    }
  }

  private async fetchMapped(id: number): Promise<RentalRate | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("rental_rate")
      .leftJoin("party", "party.id", "rental_rate.client_party_id")
      .select([
        "rental_rate.id",
        "rental_rate.client_party_id",
        "party.display_name as client_name",
        "rental_rate.gas_code",
        "rental_rate.period",
        "rental_rate.amount",
        "rental_rate.effective_from",
        "rental_rate.effective_to",
      ])
      .where("rental_rate.id", "=", id)
      .executeTakeFirst()) as RateRow | undefined;

    return row ? mapRate(row) : null;
  }
}

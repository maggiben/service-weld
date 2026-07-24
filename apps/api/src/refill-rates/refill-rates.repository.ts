import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateRefillRateInput,
  RefillRate,
  RefillRateListQuery,
  UpdateRefillRateInput,
} from "@weld/schemas";
import { refillRatesOverlap } from "@weld/domain";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import type { CapacityUnit } from "../database/schema.types";

interface RateRow {
  id: number;
  gas_code: string | null;
  capacity_m3: string | number | null;
  capacity_unit: CapacityUnit;
  amount: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
}

function toIsoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function toCapacity(value: string | number | null): number | null {
  if (value == null) return null;
  return Number(value);
}

function mapRate(row: RateRow): RefillRate {
  return {
    id: Number(row.id),
    gas_code: row.gas_code as RefillRate["gas_code"],
    capacity_m3: toCapacity(row.capacity_m3),
    capacity_unit: row.capacity_unit,
    amount: Number(row.amount),
    effective_from: toIsoDate(row.effective_from)!,
    effective_to: toIsoDate(row.effective_to),
  };
}

const RATE_SELECT = [
  "refill_rate.id",
  "refill_rate.gas_code",
  "refill_rate.capacity_m3",
  "refill_rate.capacity_unit",
  "refill_rate.amount",
  "refill_rate.effective_from",
  "refill_rate.effective_to",
] as const;

@Injectable()
export class RefillRatesRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: RefillRateListQuery): Promise<{
    data: RefillRate[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["effective_from"]);

    let qb = db.selectFrom("refill_rate").select([...RATE_SELECT]);

    if (query["filter[gas_code]"]) {
      qb = qb.where("refill_rate.gas_code", "=", query["filter[gas_code]"]);
    }
    if (query["filter[capacity_m3]"] != null) {
      qb = qb.where(
        "refill_rate.capacity_m3",
        "=",
        String(query["filter[capacity_m3]"]),
      );
    }
    if (query["filter[capacity_unit]"]) {
      qb = qb.where(
        "refill_rate.capacity_unit",
        "=",
        query["filter[capacity_unit]"],
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = String(cursor.effective_from ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("refill_rate.effective_from", ">", cursorDate),
                eb.and([
                  eb("refill_rate.effective_from", "=", cursorDate),
                  eb("refill_rate.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("refill_rate.effective_from", "<", cursorDate),
                eb.and([
                  eb("refill_rate.effective_from", "=", cursorDate),
                  eb("refill_rate.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = (await qb
      .orderBy("refill_rate.effective_from", sort.direction)
      .orderBy("refill_rate.id", sort.direction)
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

  async getById(id: number): Promise<RefillRate> {
    const row = await this.fetchMapped(id);
    if (!row) throw ApiErrors.notFound("Refill rate not found");
    return row;
  }

  async listAllCandidates(): Promise<
    Array<{
      id: number;
      gas_code: string | null;
      capacity_m3: number | null;
      capacity_unit: CapacityUnit;
      amount: number;
      effective_from: string;
      effective_to: string | null;
    }>
  > {
    const db = resolveDb(this.db);
    const rows = await db.selectFrom("refill_rate").selectAll().execute();
    return rows.map((row) => ({
      id: Number(row.id),
      gas_code: row.gas_code,
      capacity_m3: toCapacity(row.capacity_m3),
      capacity_unit: row.capacity_unit,
      amount: Number(row.amount),
      effective_from: toIsoDate(row.effective_from as string | Date)!,
      effective_to: toIsoDate(row.effective_to as string | Date | null),
    }));
  }

  async create(input: CreateRefillRateInput): Promise<RefillRate> {
    const db = resolveDb(this.db);
    const gasCode = input.gas_code ?? null;
    const capacityM3 = input.capacity_m3 ?? null;
    const capacityUnit = input.capacity_unit ?? "M3";
    const effectiveTo = input.effective_to ?? null;

    await this.assertNoOverlap({
      excludeId: null,
      gasCode,
      capacityM3,
      capacityUnit,
      effectiveFrom: input.effective_from,
      effectiveTo,
    });

    const inserted = await db
      .insertInto("refill_rate")
      .values({
        client_party_id: null,
        gas_code: gasCode,
        capacity_m3: capacityM3 == null ? null : String(capacityM3),
        capacity_unit: capacityUnit,
        amount: String(input.amount),
        effective_from: input.effective_from,
        effective_to: effectiveTo,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return this.getById(Number(inserted.id));
  }

  async update(id: number, input: UpdateRefillRateInput): Promise<RefillRate> {
    const db = resolveDb(this.db);
    const existing = await this.getById(id);

    const gasCode =
      input.gas_code !== undefined ? input.gas_code : existing.gas_code;
    const capacityM3 =
      input.capacity_m3 !== undefined
        ? input.capacity_m3
        : existing.capacity_m3;
    const capacityUnit =
      input.capacity_unit !== undefined
        ? input.capacity_unit
        : existing.capacity_unit;
    const effectiveFrom = input.effective_from ?? existing.effective_from;
    const effectiveTo =
      input.effective_to !== undefined
        ? input.effective_to
        : existing.effective_to;
    const amount = input.amount ?? existing.amount;

    await this.assertNoOverlap({
      excludeId: id,
      gasCode,
      capacityM3,
      capacityUnit,
      effectiveFrom,
      effectiveTo,
    });

    const updated = await db
      .updateTable("refill_rate")
      .set({
        client_party_id: null,
        gas_code: gasCode,
        capacity_m3: capacityM3 == null ? null : String(capacityM3),
        capacity_unit: capacityUnit,
        amount: String(amount),
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      })
      .where("id", "=", id)
      .returning("id")
      .executeTakeFirst();

    if (!updated) throw ApiErrors.notFound("Refill rate not found");
    return this.getById(id);
  }

  private async assertNoOverlap(params: {
    excludeId: number | null;
    gasCode: string | null;
    capacityM3: number | null;
    capacityUnit: CapacityUnit;
    effectiveFrom: string;
    effectiveTo: string | null;
  }): Promise<void> {
    const db = resolveDb(this.db);
    let qb = db
      .selectFrom("refill_rate")
      .select(["id", "effective_from", "effective_to"])
      .where((eb) =>
        params.gasCode == null
          ? eb("gas_code", "is", null)
          : eb("gas_code", "=", params.gasCode),
      )
      .where((eb) =>
        params.capacityM3 == null
          ? eb("capacity_m3", "is", null)
          : eb("capacity_m3", "=", String(params.capacityM3)),
      )
      .where("capacity_unit", "=", params.capacityUnit);

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
        refillRatesOverlap(incoming, {
          effective_from: toIsoDate(peer.effective_from as string | Date)!,
          effective_to: toIsoDate(peer.effective_to as string | Date | null),
        })
      ) {
        throw ApiErrors.conflict(
          "RATE_OVERLAP",
          "Overlapping refill rate for the same gas/capacity/unit",
        );
      }
    }
  }

  private async fetchMapped(id: number): Promise<RefillRate | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("refill_rate")
      .select([...RATE_SELECT])
      .where("refill_rate.id", "=", id)
      .executeTakeFirst()) as RateRow | undefined;

    return row ? mapRate(row) : null;
  }
}

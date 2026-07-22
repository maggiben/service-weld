import { Inject, Injectable } from "@nestjs/common";
import {
  classifyTransferCustodyStatus,
  type TransferCustodyStatus,
  type TransferPartyType,
} from "@weld/domain";
import type {
  CreateStockTransferInput,
  StockTransfer,
  StockTransferListQuery,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import type { CylinderState, PartyType } from "../database/schema.types";
import { resolveDb } from "../database/transaction.context";

interface TransferRow {
  id: number;
  cylinder_id: number;
  cylinder_serial: string;
  from_party_id: number;
  from_party_name: string;
  from_party_type: PartyType;
  to_party_id: number;
  to_party_name: string;
  to_party_type: PartyType;
  transfer_date: string;
  return_date: string | null;
  note: string | null;
  created_at: Date;
}

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapTransfer(row: TransferRow): StockTransfer {
  const returnDate = isoDate(row.return_date);
  const toType = row.to_party_type as TransferPartyType;
  const custody_status: TransferCustodyStatus = classifyTransferCustodyStatus(
    toType,
    returnDate,
  );
  return {
    id: Number(row.id),
    cylinder_id: Number(row.cylinder_id),
    cylinder_serial: row.cylinder_serial,
    from_party_id: Number(row.from_party_id),
    from_party_name: row.from_party_name,
    from_party_type: row.from_party_type,
    to_party_id: Number(row.to_party_id),
    to_party_name: row.to_party_name,
    to_party_type: row.to_party_type,
    transfer_date: isoDate(row.transfer_date)!,
    return_date: returnDate,
    custody_status,
    note: row.note,
    created_at: row.created_at.toISOString(),
  };
}

const TRANSFER_SELECT = [
  "stock_transfer.id",
  "stock_transfer.cylinder_id",
  "cylinder.serial_number as cylinder_serial",
  "stock_transfer.from_party_id",
  "from_party.display_name as from_party_name",
  "from_party.party_type as from_party_type",
  "stock_transfer.to_party_id",
  "to_party.display_name as to_party_name",
  "to_party.party_type as to_party_type",
  "stock_transfer.transfer_date",
  "stock_transfer.return_date",
  "stock_transfer.note",
  "stock_transfer.created_at",
] as const;

@Injectable()
export class TransfersRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: StockTransferListQuery): Promise<{
    data: StockTransfer[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["transfer_date"]);

    let qb = db
      .selectFrom("stock_transfer")
      .innerJoin("cylinder", "cylinder.id", "stock_transfer.cylinder_id")
      .innerJoin(
        "party as from_party",
        "from_party.id",
        "stock_transfer.from_party_id",
      )
      .innerJoin(
        "party as to_party",
        "to_party.id",
        "stock_transfer.to_party_id",
      )
      .select(TRANSFER_SELECT);

    if (query["filter[cylinder_id]"] != null) {
      qb = qb.where(
        "stock_transfer.cylinder_id",
        "=",
        query["filter[cylinder_id]"],
      );
    }
    if (query["filter[to_party_id]"] != null) {
      qb = qb.where(
        "stock_transfer.to_party_id",
        "=",
        query["filter[to_party_id]"],
      );
    }
    if (query["filter[from_party_id]"] != null) {
      qb = qb.where(
        "stock_transfer.from_party_id",
        "=",
        query["filter[from_party_id]"],
      );
    }
    if (query["filter[transfer_date][gte]"]) {
      qb = qb.where(
        "stock_transfer.transfer_date",
        ">=",
        query["filter[transfer_date][gte]"],
      );
    }
    if (query["filter[transfer_date][lte]"]) {
      qb = qb.where(
        "stock_transfer.transfer_date",
        "<=",
        query["filter[transfer_date][lte]"],
      );
    }
    if (query.open === true) {
      qb = qb.where("stock_transfer.return_date", "is", null);
    } else if (query.open === false) {
      qb = qb.where("stock_transfer.return_date", "is not", null);
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorDate = String(cursor.transfer_date ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("stock_transfer.transfer_date", ">", cursorDate),
                eb.and([
                  eb("stock_transfer.transfer_date", "=", cursorDate),
                  eb("stock_transfer.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("stock_transfer.transfer_date", "<", cursorDate),
                eb.and([
                  eb("stock_transfer.transfer_date", "=", cursorDate),
                  eb("stock_transfer.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = (await qb
      .orderBy("stock_transfer.transfer_date", sort.direction)
      .orderBy("stock_transfer.id", sort.direction)
      .limit(limit + 1)
      .execute()) as TransferRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map(mapTransfer),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                transfer_date: isoDate(last.transfer_date),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getById(id: number): Promise<StockTransfer | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("stock_transfer")
      .innerJoin("cylinder", "cylinder.id", "stock_transfer.cylinder_id")
      .innerJoin(
        "party as from_party",
        "from_party.id",
        "stock_transfer.from_party_id",
      )
      .innerJoin(
        "party as to_party",
        "to_party.id",
        "stock_transfer.to_party_id",
      )
      .select(TRANSFER_SELECT)
      .where("stock_transfer.id", "=", id)
      .executeTakeFirst()) as TransferRow | undefined;
    return row ? mapTransfer(row) : null;
  }

  async getParty(partyId: number): Promise<{
    id: number;
    party_type: PartyType;
    display_name: string;
  } | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("party")
      .select(["id", "party_type", "display_name"])
      .where("id", "=", partyId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row
      ? {
          id: Number(row.id),
          party_type: row.party_type,
          display_name: row.display_name,
        }
      : null;
  }

  async getCylinder(cylinderId: number): Promise<{
    id: number;
    state: CylinderState;
  } | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("cylinder")
      .select(["id", "state"])
      .where("id", "=", cylinderId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row ? { id: Number(row.id), state: row.state } : null;
  }

  async create(
    input: CreateStockTransferInput,
    actorUserId: number,
  ): Promise<StockTransfer> {
    const db = resolveDb(this.db);
    const inserted = await db
      .insertInto("stock_transfer")
      .values({
        cylinder_id: input.cylinder_id,
        from_party_id: input.from_party_id,
        to_party_id: input.to_party_id,
        transfer_date: input.transfer_date,
        return_date: input.return_date ?? null,
        note: input.note ?? null,
        created_by: actorUserId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const created = await this.getById(Number(inserted.id));
    if (!created) throw ApiErrors.notFound("Transfer not found after create");
    return created;
  }

  async close(id: number, returnDate: string): Promise<StockTransfer | null> {
    const db = resolveDb(this.db);
    const updated = await db
      .updateTable("stock_transfer")
      .set({ return_date: returnDate })
      .where("id", "=", id)
      .where("return_date", "is", null)
      .returning("id")
      .executeTakeFirst();
    if (!updated) return null;
    return this.getById(Number(updated.id));
  }
}

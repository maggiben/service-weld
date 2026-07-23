import { Inject, Injectable } from "@nestjs/common";
import { businessTodayIso, isLoanOverdue } from "@weld/domain";
import type {
  AdvanceSupplierLoanInput,
  CreateSupplierLoanInput,
  SupplierLoan,
  SupplierLoanListQuery,
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
  CylinderState,
  LoanStage,
  PartyType,
} from "../database/schema.types";
import { resolveDb } from "../database/transaction.context";
import { SettingsRepository } from "../settings/settings.repository";

interface LoanRow {
  id: number;
  cylinder_id: number;
  cylinder_serial: string;
  supplier_party_id: number;
  supplier_name: string;
  client_party_id: number | null;
  client_name: string | null;
  gas_code: string | null;
  received_from_supplier: string | null;
  delivered_to_client: string | null;
  returned_by_client: string | null;
  returned_to_supplier: string | null;
  stage: LoanStage;
  version: number;
}

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Calendar cutoff: asOf − overdueDays (inclusive threshold for received date). */
function overdueCutoffIso(asOf: string, overdueDays: number): string {
  const [year, member, data] = asOf.split("-").map(Number);
  const date = new Date(Date.UTC(year!, member! - 1, data!));
  date.setUTCDate(date.getUTCDate() - overdueDays);
  return date.toISOString().slice(0, 10);
}

function mapLoan(
  row: LoanRow,
  asOf: string,
  overdueDays: number,
): SupplierLoan {
  const received = isoDate(row.received_from_supplier);
  return {
    id: Number(row.id),
    cylinder_id: Number(row.cylinder_id),
    cylinder_serial: row.cylinder_serial,
    supplier_party_id: Number(row.supplier_party_id),
    supplier_name: row.supplier_name,
    client_party_id:
      row.client_party_id == null ? null : Number(row.client_party_id),
    client_name: row.client_name,
    gas_code: row.gas_code as SupplierLoan["gas_code"],
    received_from_supplier: received,
    delivered_to_client: isoDate(row.delivered_to_client),
    returned_by_client: isoDate(row.returned_by_client),
    returned_to_supplier: isoDate(row.returned_to_supplier),
    stage: row.stage,
    version: Number(row.version),
    overdue: isLoanOverdue({
      stage: row.stage,
      receivedFromSupplier: received,
      asOf,
      overdueDays,
    }),
  };
}

const LOAN_SELECT = [
  "supplier_loan_cycle.id",
  "supplier_loan_cycle.cylinder_id",
  "cylinder.serial_number as cylinder_serial",
  "supplier_loan_cycle.supplier_party_id",
  "supplier.display_name as supplier_name",
  "supplier_loan_cycle.client_party_id",
  "client_party.display_name as client_name",
  "supplier_loan_cycle.gas_code",
  "supplier_loan_cycle.received_from_supplier",
  "supplier_loan_cycle.delivered_to_client",
  "supplier_loan_cycle.returned_by_client",
  "supplier_loan_cycle.returned_to_supplier",
  "supplier_loan_cycle.stage",
  "supplier_loan_cycle.version",
] as const;

@Injectable()
export class SupplierLoansRepository {
  constructor(
    @Inject(KYSELY) private readonly db: DB,
    private readonly settings: SettingsRepository,
  ) {}

  async list(query: SupplierLoanListQuery): Promise<{
    data: SupplierLoan[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["received_from_supplier"]);
    const overdueDays = await this.settings.getSupplierLoanOverdueDays();
    const asOf = businessTodayIso(
      new Date(),
      await this.settings.getBusinessTimezone(),
    );

    let qb = db
      .selectFrom("supplier_loan_cycle")
      .innerJoin("cylinder", "cylinder.id", "supplier_loan_cycle.cylinder_id")
      .innerJoin(
        "party as supplier",
        "supplier.id",
        "supplier_loan_cycle.supplier_party_id",
      )
      .leftJoin(
        "party as client_party",
        "client_party.id",
        "supplier_loan_cycle.client_party_id",
      )
      .select(LOAN_SELECT);

    if (query["filter[supplier_party_id]"] != null) {
      qb = qb.where(
        "supplier_loan_cycle.supplier_party_id",
        "=",
        query["filter[supplier_party_id]"],
      );
    }
    if (query["filter[stage]"]) {
      qb = qb.where("supplier_loan_cycle.stage", "=", query["filter[stage]"]);
    }
    if (query.open === true) {
      qb = qb.where("supplier_loan_cycle.returned_to_supplier", "is", null);
    } else if (query.open === false) {
      qb = qb.where("supplier_loan_cycle.returned_to_supplier", "is not", null);
    }
    if (query.overdue === true) {
      const cutoff = overdueCutoffIso(asOf, overdueDays);
      qb = qb
        .where("supplier_loan_cycle.returned_to_supplier", "is", null)
        .where("supplier_loan_cycle.received_from_supplier", "is not", null)
        .where("supplier_loan_cycle.received_from_supplier", "<=", cutoff);
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const rawDate = cursor.received_from_supplier;
      const cursorDate =
        rawDate == null || rawDate === "" ? null : String(rawDate);
      const cursorId = Number(cursor.id ?? 0);

      // received_from_supplier is nullable. ASC uses NULLS LAST (PG default);
      // a cursor whose date is null must only walk remaining null rows by id.
      // A non-null cursor must also eventually include null-dated rows.
      qb =
        sort.direction === "asc"
          ? cursorDate == null
            ? qb.where((eb) =>
                eb.and([
                  eb("supplier_loan_cycle.received_from_supplier", "is", null),
                  eb("supplier_loan_cycle.id", ">", cursorId),
                ]),
              )
            : qb.where((eb) =>
                eb.or([
                  eb(
                    "supplier_loan_cycle.received_from_supplier",
                    ">",
                    cursorDate,
                  ),
                  eb.and([
                    eb(
                      "supplier_loan_cycle.received_from_supplier",
                      "=",
                      cursorDate,
                    ),
                    eb("supplier_loan_cycle.id", ">", cursorId),
                  ]),
                  eb("supplier_loan_cycle.received_from_supplier", "is", null),
                ]),
              )
          : cursorDate == null
            ? qb.where((eb) =>
                eb.or([
                  eb.and([
                    eb(
                      "supplier_loan_cycle.received_from_supplier",
                      "is",
                      null,
                    ),
                    eb("supplier_loan_cycle.id", "<", cursorId),
                  ]),
                  eb(
                    "supplier_loan_cycle.received_from_supplier",
                    "is not",
                    null,
                  ),
                ]),
              )
            : qb.where((eb) =>
                eb.or([
                  eb(
                    "supplier_loan_cycle.received_from_supplier",
                    "<",
                    cursorDate,
                  ),
                  eb.and([
                    eb(
                      "supplier_loan_cycle.received_from_supplier",
                      "=",
                      cursorDate,
                    ),
                    eb("supplier_loan_cycle.id", "<", cursorId),
                  ]),
                ]),
              );
    }

    const rows = (await qb
      .orderBy("supplier_loan_cycle.received_from_supplier", (ob) =>
        sort.direction === "asc"
          ? ob.asc().nullsLast()
          : ob.desc().nullsFirst(),
      )
      .orderBy("supplier_loan_cycle.id", sort.direction)
      .limit(limit + 1)
      .execute()) as LoanRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) => mapLoan(row, asOf, overdueDays)),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                received_from_supplier: isoDate(last.received_from_supplier),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getById(id: number): Promise<SupplierLoan | null> {
    const db = resolveDb(this.db);
    const overdueDays = await this.settings.getSupplierLoanOverdueDays();
    const asOf = businessTodayIso(
      new Date(),
      await this.settings.getBusinessTimezone(),
    );
    const row = (await db
      .selectFrom("supplier_loan_cycle")
      .innerJoin("cylinder", "cylinder.id", "supplier_loan_cycle.cylinder_id")
      .innerJoin(
        "party as supplier",
        "supplier.id",
        "supplier_loan_cycle.supplier_party_id",
      )
      .leftJoin(
        "party as client_party",
        "client_party.id",
        "supplier_loan_cycle.client_party_id",
      )
      .select(LOAN_SELECT)
      .where("supplier_loan_cycle.id", "=", id)
      .executeTakeFirst()) as LoanRow | undefined;
    return row ? mapLoan(row, asOf, overdueDays) : null;
  }

  async getPartyType(partyId: number): Promise<PartyType | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("party")
      .select("party_type")
      .where("id", "=", partyId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row?.party_type ?? null;
  }

  async getCylinder(cylinderId: number): Promise<{
    id: number;
    serial_number: string;
    state: CylinderState;
    gas_code: string | null;
    version: number;
  } | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("cylinder")
      .select(["id", "serial_number", "state", "gas_code", "version"])
      .where("id", "=", cylinderId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row
      ? {
          id: Number(row.id),
          serial_number: row.serial_number,
          state: row.state,
          gas_code: row.gas_code,
          version: Number(row.version),
        }
      : null;
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

  async create(input: CreateSupplierLoanInput): Promise<SupplierLoan> {
    const db = resolveDb(this.db);
    const inserted = await db
      .insertInto("supplier_loan_cycle")
      .values({
        cylinder_id: input.cylinder_id,
        supplier_party_id: input.supplier_party_id,
        gas_code: input.gas_code ?? null,
        received_from_supplier: input.received_from_supplier,
        stage: "RECEIVED",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db
      .updateTable("cylinder")
      .set({ state: "IN_STOCK_FULL" })
      .where("id", "=", input.cylinder_id)
      .execute();

    const created = await this.getById(Number(inserted.id));
    if (!created) throw ApiErrors.notFound("Loan not found after create");
    return created;
  }

  async advance(
    id: number,
    input: AdvanceSupplierLoanInput,
    expectedVersion: number,
  ): Promise<SupplierLoan> {
    const db = resolveDb(this.db);

    const patch: {
      stage: LoanStage;
      version: number;
      delivered_to_client?: string;
      returned_by_client?: string;
      returned_to_supplier?: string;
      client_party_id?: number;
    } = {
      stage: input.stage,
      version: expectedVersion + 1,
    };

    let cylinderState: CylinderState | null = null;

    if (input.stage === "OUT_TO_CLIENT") {
      patch.delivered_to_client = input.date;
      if (input.client_party_id != null) {
        patch.client_party_id = input.client_party_id;
      }
      cylinderState = "AT_CLIENT";
    } else if (input.stage === "BACK_FROM_CLIENT") {
      patch.returned_by_client = input.date;
      cylinderState = "IN_STOCK_EMPTY";
    } else if (input.stage === "RETURNED_TO_SUPPLIER") {
      patch.returned_to_supplier = input.date;
      cylinderState = "RETURNED_TO_SUPPLIER";
    }

    const updated = await db
      .updateTable("supplier_loan_cycle")
      .set(patch)
      .where("id", "=", id)
      .where("version", "=", expectedVersion)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Loan version conflict");
    }

    if (cylinderState) {
      const loan = await db
        .selectFrom("supplier_loan_cycle")
        .select("cylinder_id")
        .where("id", "=", id)
        .executeTakeFirstOrThrow();

      await db
        .updateTable("cylinder")
        .set({ state: cylinderState })
        .where("id", "=", Number(loan.cylinder_id))
        .execute();
    }

    const result = await this.getById(id);
    if (!result) throw ApiErrors.notFound("Loan not found");
    return result;
  }
}

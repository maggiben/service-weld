import { Inject, Injectable } from "@nestjs/common";
import {
  agingBucket,
  billableDaysInPeriod,
  businessTodayIso,
  calendarDaysBetween,
  dailyUnitPrice,
  matchesAgingFilter,
  resolveEffectiveRate,
} from "@weld/domain";
import type {
  CylinderLifeRow,
  DataQualityQuery,
  DataQualityRow,
  FleetQuery,
  FleetRow,
  FloatAgingQuery,
  FloatAgingRow,
  LossReportQuery,
  LossReportRow,
  MedicalStatementQuery,
  MedicalStatementRow,
  RentalReportQuery,
  RentalReportRow,
  SupplierReturnsQuery,
  SupplierReturnsRow,
} from "@weld/schemas";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class ReportsRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async fleet(query: FleetQuery): Promise<FleetRow[]> {
    const db = resolveDb(this.db);

    if (query.group_by === "state") {
      let qb = db
        .selectFrom("cylinder")
        .select(["cylinder.state"])
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("cylinder.deleted_at", "is", null);
      if (query["filter[owner_party_id]"] != null) {
        qb = qb.where(
          "cylinder.owner_party_id",
          "=",
          query["filter[owner_party_id]"],
        );
      }
      if (query["filter[gas_code]"]) {
        qb = qb.where("cylinder.gas_code", "=", query["filter[gas_code]"]);
      }
      const rows = await qb.groupBy(["cylinder.state"]).execute();
      return rows.map((r) => ({
        group_key: r.state,
        state: r.state,
        count: Number(r.count),
      }));
    }

    if (query.group_by === "gas_code") {
      let qb = db
        .selectFrom("cylinder")
        .select(["cylinder.gas_code"])
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("cylinder.deleted_at", "is", null);
      if (query["filter[owner_party_id]"] != null) {
        qb = qb.where(
          "cylinder.owner_party_id",
          "=",
          query["filter[owner_party_id]"],
        );
      }
      if (query["filter[gas_code]"]) {
        qb = qb.where("cylinder.gas_code", "=", query["filter[gas_code]"]);
      }
      const rows = await qb.groupBy(["cylinder.gas_code"]).execute();
      return rows.map((r) => ({
        group_key: r.gas_code ?? "UNKNOWN",
        gas_code: r.gas_code as FleetRow["gas_code"],
        count: Number(r.count),
      }));
    }

    if (query.group_by === "locality") {
      // Current float by client city (open holdings only).
      let qb = db
        .selectFrom("movement_event")
        .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
        .innerJoin(
          "client",
          "client.party_id",
          "movement_event.holder_party_id",
        )
        .leftJoin("locality", "locality.id", "client.locality_id")
        .select(["client.locality_id", "locality.name as locality_name"])
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("movement_event.state", "=", "OPEN")
        .where("movement_event.return_date", "is", null)
        .where("cylinder.deleted_at", "is", null)
        .where("client.deleted_at", "is", null);
      if (query["filter[owner_party_id]"] != null) {
        qb = qb.where(
          "cylinder.owner_party_id",
          "=",
          query["filter[owner_party_id]"],
        );
      }
      if (query["filter[gas_code]"]) {
        qb = qb.where("cylinder.gas_code", "=", query["filter[gas_code]"]);
      }
      const rows = await qb
        .groupBy(["client.locality_id", "locality.name"])
        .orderBy("count", "desc")
        .execute();
      return rows.map((r) => ({
        group_key: r.locality_id != null ? String(r.locality_id) : "UNASSIGNED",
        locality_id: r.locality_id == null ? null : Number(r.locality_id),
        locality_name: r.locality_name ?? null,
        count: Number(r.count),
      }));
    }

    if (query.group_by === "client") {
      // Current float by holding client (open holdings only).
      let qb = db
        .selectFrom("movement_event")
        .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
        .innerJoin("party", "party.id", "movement_event.holder_party_id")
        .select([
          "movement_event.holder_party_id as client_party_id",
          "party.display_name as client_name",
        ])
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("movement_event.state", "=", "OPEN")
        .where("movement_event.return_date", "is", null)
        .where("cylinder.deleted_at", "is", null);
      if (query["filter[owner_party_id]"] != null) {
        qb = qb.where(
          "cylinder.owner_party_id",
          "=",
          query["filter[owner_party_id]"],
        );
      }
      if (query["filter[gas_code]"]) {
        qb = qb.where("cylinder.gas_code", "=", query["filter[gas_code]"]);
      }
      const rows = await qb
        .groupBy(["movement_event.holder_party_id", "party.display_name"])
        .orderBy("count", "desc")
        .execute();
      return rows.map((r) => ({
        group_key: String(r.client_party_id),
        client_party_id: Number(r.client_party_id),
        client_name: r.client_name,
        count: Number(r.count),
      }));
    }

    let qb = db
      .selectFrom("cylinder")
      .innerJoin("party", "party.id", "cylinder.owner_party_id")
      .select(["cylinder.owner_party_id", "party.display_name as owner_name"])
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("cylinder.deleted_at", "is", null);
    if (query["filter[owner_party_id]"] != null) {
      qb = qb.where(
        "cylinder.owner_party_id",
        "=",
        query["filter[owner_party_id]"],
      );
    }
    if (query["filter[gas_code]"]) {
      qb = qb.where("cylinder.gas_code", "=", query["filter[gas_code]"]);
    }
    const rows = await qb
      .groupBy(["cylinder.owner_party_id", "party.display_name"])
      .execute();
    return rows.map((r) => ({
      group_key: String(r.owner_party_id),
      owner_party_id: Number(r.owner_party_id),
      owner_name: r.owner_name,
      count: Number(r.count),
    }));
  }

  async floatAging(query: FloatAgingQuery): Promise<{
    data: FloatAgingRow[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const asOf = query.as_of ?? businessTodayIso();
    const limit = query.limit;
    const sort = parseSort(query.sort, ["days_out"]);

    let qb = db
      .selectFrom("movement_event")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .leftJoin("client", "client.party_id", "movement_event.holder_party_id")
      .select([
        "movement_event.id as movement_id",
        "movement_event.cylinder_id",
        "cylinder.serial_number",
        "movement_event.holder_party_id as client_party_id",
        "party.display_name as client_name",
        "movement_event.delivery_date",
        "client.territory_id",
      ])
      .where("movement_event.state", "=", "OPEN")
      .where("movement_event.return_date", "is", null);

    if (query["filter[territory_id]"] != null) {
      qb = qb.where("client.territory_id", "=", query["filter[territory_id]"]);
    }

    const rows = await qb.execute();
    let mapped: FloatAgingRow[] = rows.map((row) => {
      const delivery = isoDate(row.delivery_date)!;
      const days_out = calendarDaysBetween(delivery, asOf);
      return {
        movement_id: Number(row.movement_id),
        cylinder_id: Number(row.cylinder_id),
        serial_number: row.serial_number,
        client_party_id: Number(row.client_party_id),
        client_name: row.client_name,
        delivery_date: delivery,
        days_out,
        bucket: agingBucket(days_out),
      };
    });

    mapped = mapped.filter((r) => matchesAgingFilter(r.days_out, query.bucket));
    mapped.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      return (a.days_out - b.days_out) * dir;
    });

    let start = 0;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const id = Number(cursor.movement_id ?? 0);
      const idx = mapped.findIndex((r) => r.movement_id === id);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const pageRows = mapped.slice(start, start + limit + 1);
    const hasMore = pageRows.length > limit;
    const data = hasMore ? pageRows.slice(0, limit) : pageRows;
    const last = data[data.length - 1];

    return {
      data,
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ movement_id: last.movement_id })
            : null,
      }),
    };
  }

  async rental(query: RentalReportQuery): Promise<RentalReportRow[]> {
    const db = resolveDb(this.db);
    let qb = db
      .selectFrom("movement_event")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .leftJoin("client", "client.party_id", "movement_event.holder_party_id")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .select([
        "movement_event.holder_party_id",
        "party.display_name as client_name",
        "movement_event.gas_code",
        "cylinder.capacity_m3",
        "cylinder.capacity_unit",
        "movement_event.delivery_date",
        "movement_event.return_date",
        "movement_event.rental_days",
        "movement_event.state",
        "client.daily_rate_default",
      ])
      .where("movement_event.movement_kind", "=", "RENTAL")
      .where("movement_event.state", "in", ["OPEN", "CLOSED", "SWAPPED"])
      .where("movement_event.delivery_date", "<=", query.period_end)
      .where((eb) =>
        eb.or([
          eb("movement_event.return_date", "is", null),
          eb("movement_event.return_date", ">=", query.period_start),
        ]),
      );

    if (query["filter[territory_id]"] != null) {
      qb = qb.where("client.territory_id", "=", query["filter[territory_id]"]);
    }
    if (query["filter[gas_code]"]) {
      qb = qb.where("movement_event.gas_code", "=", query["filter[gas_code]"]);
    }
    if (query["filter[client_party_id]"] != null) {
      qb = qb.where(
        "movement_event.holder_party_id",
        "=",
        query["filter[client_party_id]"],
      );
    }
    if (query["filter[cylinder_id]"] != null) {
      qb = qb.where(
        "movement_event.cylinder_id",
        "=",
        query["filter[cylinder_id]"],
      );
    }

    const rows = await qb.execute();
    const rates = await db.selectFrom("rental_rate").selectAll().execute();
    const candidates = rates.map((r) => ({
      id: Number(r.id),
      client_party_id:
        r.client_party_id == null ? null : Number(r.client_party_id),
      gas_code: r.gas_code,
      capacity_m3: r.capacity_m3 == null ? null : Number(r.capacity_m3),
      capacity_unit: (r.capacity_unit ?? "M3") as "M3" | "KG",
      period: r.period as "DAILY" | "MONTHLY",
      amount: Number(r.amount),
      effective_from: isoDate(r.effective_from)!,
      effective_to: isoDate(r.effective_to),
    }));

    const agg = new Map<
      string,
      {
        client_party_id: number;
        client_name: string;
        gas_code: RentalReportRow["gas_code"];
        rental_days: number;
        revenue: number;
        movement_count: number;
      }
    >();

    for (const row of rows) {
      const delivery = isoDate(row.delivery_date)!;
      const ret = isoDate(row.return_date);
      const days = billableDaysInPeriod({
        deliveryDate: delivery,
        returnDate: ret,
        periodStart: query.period_start,
        periodEnd: query.period_end,
        asOfDate: businessTodayIso(),
      });
      if (days === 0) continue;

      const rate = resolveEffectiveRate(
        candidates,
        Number(row.holder_party_id),
        row.gas_code,
        delivery,
        row.capacity_m3 == null ? null : Number(row.capacity_m3),
        (row.capacity_unit ?? "M3") as "M3" | "KG",
      );
      const fallback = row.daily_rate_default
        ? Number(row.daily_rate_default)
        : 0;
      const daily = rate ? dailyUnitPrice(rate).amount : fallback;
      const revenue = Math.round(days * daily * 100) / 100;

      const key = `${row.holder_party_id}:${row.gas_code ?? ""}`;
      const cur = agg.get(key) ?? {
        client_party_id: Number(row.holder_party_id),
        client_name: row.client_name,
        gas_code: row.gas_code as RentalReportRow["gas_code"],
        rental_days: 0,
        revenue: 0,
        movement_count: 0,
      };
      cur.rental_days += days;
      cur.revenue = Math.round((cur.revenue + revenue) * 100) / 100;
      cur.movement_count += 1;
      agg.set(key, cur);
    }

    return [...agg.values()].sort((a, b) => b.revenue - a.revenue);
  }

  async loss(query: LossReportQuery): Promise<LossReportRow[]> {
    const db = resolveDb(this.db);
    let qb = db
      .selectFrom("cylinder")
      .innerJoin("party", "party.id", "cylinder.owner_party_id")
      .select([
        "cylinder.owner_party_id",
        "party.display_name as owner_name",
        "cylinder.ownership_basis",
        "cylinder.state",
      ])
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("cylinder.state", "in", ["LOST", "BROKEN"])
      .where("cylinder.deleted_at", "is", null)
      .groupBy([
        "cylinder.owner_party_id",
        "party.display_name",
        "cylinder.ownership_basis",
        "cylinder.state",
      ]);

    if (query["filter[owner_party_id]"] != null) {
      qb = qb.where(
        "cylinder.owner_party_id",
        "=",
        query["filter[owner_party_id]"],
      );
    }
    // period filters use updated_at as proxy when loss date not stored separately
    if (query.period_start) {
      qb = qb.where("cylinder.updated_at", ">=", new Date(query.period_start));
    }
    if (query.period_end) {
      qb = qb.where(
        "cylinder.updated_at",
        "<=",
        new Date(`${query.period_end}T23:59:59Z`),
      );
    }

    const rows = await qb.execute();
    return rows.map((r) => ({
      owner_party_id: Number(r.owner_party_id),
      owner_name: r.owner_name,
      ownership_basis: r.ownership_basis,
      state: r.state as "LOST" | "BROKEN",
      count: Number(r.count),
      liability:
        r.ownership_basis === "SUPPLIER"
          ? "SUPPLIER"
          : r.ownership_basis === "CUSTOMER"
            ? "CUSTOMER"
            : "OURS",
    }));
  }

  async supplierReturns(query: SupplierReturnsQuery): Promise<{
    data: SupplierReturnsRow[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const asOf = query.as_of ?? businessTodayIso();
    const limit = query.limit;
    const sort = parseSort(query.sort, ["days_open"]);

    let qb = db
      .selectFrom("supplier_loan_cycle")
      .innerJoin("cylinder", "cylinder.id", "supplier_loan_cycle.cylinder_id")
      .innerJoin("party", "party.id", "supplier_loan_cycle.supplier_party_id")
      .select([
        "supplier_loan_cycle.id as loan_id",
        "supplier_loan_cycle.cylinder_id",
        "cylinder.serial_number",
        "supplier_loan_cycle.supplier_party_id",
        "party.display_name as supplier_name",
        "supplier_loan_cycle.stage",
        "supplier_loan_cycle.received_from_supplier",
      ])
      .where("supplier_loan_cycle.returned_to_supplier", "is", null);

    if (query["filter[supplier_party_id]"] != null) {
      qb = qb.where(
        "supplier_loan_cycle.supplier_party_id",
        "=",
        query["filter[supplier_party_id]"],
      );
    }

    const rows = await qb.execute();
    let mapped: SupplierReturnsRow[] = rows.map((row) => {
      const received = isoDate(row.received_from_supplier);
      const days_open = received ? calendarDaysBetween(received, asOf) : 0;
      return {
        loan_id: Number(row.loan_id),
        cylinder_id: Number(row.cylinder_id),
        serial_number: row.serial_number,
        supplier_party_id: Number(row.supplier_party_id),
        supplier_name: row.supplier_name,
        stage: row.stage,
        received_from_supplier: received,
        days_open,
      };
    });

    if (query.min_days != null) {
      mapped = mapped.filter((r) => r.days_open >= query.min_days!);
    }
    mapped.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      return (a.days_open - b.days_open) * dir;
    });

    let start = 0;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const id = Number(cursor.loan_id ?? 0);
      const idx = mapped.findIndex((r) => r.loan_id === id);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const pageRows = mapped.slice(start, start + limit + 1);
    const hasMore = pageRows.length > limit;
    const data = hasMore ? pageRows.slice(0, limit) : pageRows;
    const last = data[data.length - 1];

    return {
      data,
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last ? encodeCursor({ loan_id: last.loan_id }) : null,
      }),
    };
  }

  async cylinderLife(
    cylinderId: number,
    gte?: string,
    lte?: string,
  ): Promise<CylinderLifeRow[]> {
    const db = resolveDb(this.db);
    let movementsQb = db
      .selectFrom("movement_event")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .select([
        "movement_event.id as movement_id",
        "movement_event.holder_party_id",
        "party.display_name as holder_name",
        "movement_event.movement_kind",
        "movement_event.delivery_date",
        "movement_event.return_date",
        "movement_event.rental_days",
        "movement_event.state",
        "movement_event.note",
      ])
      .where("movement_event.cylinder_id", "=", cylinderId);

    if (gte)
      movementsQb = movementsQb.where(
        "movement_event.delivery_date",
        ">=",
        gte,
      );
    if (lte)
      movementsQb = movementsQb.where(
        "movement_event.delivery_date",
        "<=",
        lte,
      );

    let loansQb = db
      .selectFrom("supplier_loan_cycle")
      .innerJoin("party", "party.id", "supplier_loan_cycle.supplier_party_id")
      .select([
        "supplier_loan_cycle.id as loan_id",
        "supplier_loan_cycle.supplier_party_id as holder_party_id",
        "party.display_name as holder_name",
        "supplier_loan_cycle.received_from_supplier as delivery_date",
        "supplier_loan_cycle.returned_to_supplier as return_date",
      ])
      .where("supplier_loan_cycle.cylinder_id", "=", cylinderId)
      .where("supplier_loan_cycle.received_from_supplier", "is not", null);

    if (gte) {
      loansQb = loansQb.where(
        "supplier_loan_cycle.received_from_supplier",
        ">=",
        gte,
      );
    }
    if (lte) {
      loansQb = loansQb.where(
        "supplier_loan_cycle.received_from_supplier",
        "<=",
        lte,
      );
    }

    const [movementRows, loanRows] = await Promise.all([
      movementsQb.execute(),
      loansQb.execute(),
    ]);

    const merged: CylinderLifeRow[] = [
      ...movementRows.map((row) => ({
        event_source: "MOVEMENT" as const,
        movement_id: Number(row.movement_id),
        loan_id: null,
        holder_party_id: Number(row.holder_party_id),
        holder_name: row.holder_name,
        movement_kind: row.movement_kind,
        delivery_date: isoDate(row.delivery_date)!,
        return_date: isoDate(row.return_date),
        rental_days: row.rental_days == null ? null : Number(row.rental_days),
        state: row.state,
        note: row.note,
      })),
      ...loanRows.map((row) => {
        const returnDate = isoDate(row.return_date);
        return {
          event_source: "SUPPLIER_LOAN" as const,
          movement_id: null,
          loan_id: Number(row.loan_id),
          holder_party_id: Number(row.holder_party_id),
          holder_name: row.holder_name,
          movement_kind: "SUPPLIER_LOAN",
          delivery_date: isoDate(row.delivery_date)!,
          return_date: returnDate,
          rental_days: null,
          state: returnDate != null ? "CLOSED" : "OPEN",
          note: null,
        };
      }),
    ];

    merged.sort((a, b) => {
      const dateCmp = b.delivery_date.localeCompare(a.delivery_date);
      if (dateCmp !== 0) return dateCmp;
      const aId = a.movement_id ?? a.loan_id ?? 0;
      const bId = b.movement_id ?? b.loan_id ?? 0;
      const sourceCmp = b.event_source.localeCompare(a.event_source);
      if (sourceCmp !== 0) return sourceCmp;
      return bId - aId;
    });

    return merged;
  }

  async medicalStatement(
    query: MedicalStatementQuery,
  ): Promise<MedicalStatementRow[]> {
    const db = resolveDb(this.db);
    let clientsQb = db
      .selectFrom("client")
      .innerJoin("party", "party.id", "client.party_id")
      .select(["client.party_id", "party.display_name"])
      .where("client.coverage", "=", "MUNICIPAL_HOSPITAL")
      .where("client.deleted_at", "is", null);

    if (query["filter[client_party_id]"] != null) {
      clientsQb = clientsQb.where(
        "client.party_id",
        "=",
        query["filter[client_party_id]"],
      );
    }

    const clients = await clientsQb.execute();
    const result: MedicalStatementRow[] = [];

    for (const client of clients) {
      const moves = await db
        .selectFrom("movement_event")
        .select(["delivery_date", "return_date", "rental_days", "gas_code"])
        .where("holder_party_id", "=", Number(client.party_id))
        .where("delivery_date", ">=", query.period_start)
        .where("delivery_date", "<=", query.period_end)
        .where("state", "!=", "VOID")
        .execute();

      const o2Moves = moves.filter(
        (m) => m.gas_code === "O2" || m.gas_code === "O2_MED",
      );
      const rental_days = o2Moves.reduce(
        (sum, m) => sum + (m.rental_days == null ? 0 : Number(m.rental_days)),
        0,
      );

      const accessories = await db
        .selectFrom("accessory_rental")
        .select((eb) => eb.fn.countAll<string>().as("c"))
        .where("client_party_id", "=", Number(client.party_id))
        .where("start_date", ">=", query.period_start)
        .where("start_date", "<=", query.period_end)
        .executeTakeFirst();

      result.push({
        client_party_id: Number(client.party_id),
        client_name: client.display_name,
        deliveries: o2Moves.length,
        rental_days,
        accessory_rentals: Number(accessories?.c ?? 0),
      });
    }

    return result.sort((a, b) => a.client_name.localeCompare(b.client_name));
  }

  async dataQuality(query: DataQualityQuery): Promise<{
    data: DataQualityRow[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["created_at"]);

    // migration_exception columns — match schema
    let qb = db.selectFrom("migration_exception").selectAll();

    if (query["filter[type]"]) {
      qb = qb.where("reason", "ilike", `%${query["filter[type]"]}%`);
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorAt = String(cursor.created_at ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("created_at", ">", new Date(cursorAt)),
                eb.and([
                  eb("created_at", "=", new Date(cursorAt)),
                  eb("id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("created_at", "<", new Date(cursorAt)),
                eb.and([
                  eb("created_at", "=", new Date(cursorAt)),
                  eb("id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = await qb
      .orderBy("created_at", sort.direction)
      .orderBy("id", sort.direction)
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((row) => ({
        id: Number(row.id),
        source: row.workbook,
        reason: row.reason,
        sheet: row.sheet,
        row_ref: row.row_ref,
        status: row.status,
        created_at: row.created_at.toISOString(),
      })),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                created_at: (last.created_at as Date).toISOString(),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }
}

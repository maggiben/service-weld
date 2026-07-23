import { Inject, Injectable } from "@nestjs/common";
import { businessTodayIso, calendarDaysBetween } from "@weld/domain";
import type {
  Alert,
  AlertListQuery,
  RefreshAlertsResult,
  UpdateAlertContact,
} from "@weld/schemas";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import { SettingsRepository } from "../settings/settings.repository";

type AlertRow = {
  id: number | string | bigint;
  alert_type: string;
  entity_table: string | null;
  entity_id: number | string | bigint | null;
  severity: number | string;
  created_at: Date;
  resolved_at: Date | null;
  assigned_role: string | null;
  contact_note: string | null;
  last_contacted_at: Date | null;
};

type AlertContext = {
  cylinder_id: number | null;
  cylinder_serial: string | null;
  client_party_id: number | null;
  client_name: string | null;
  counterparty_name: string | null;
  gas_code: string | null;
  days_open: number | null;
  loan_stage: string | null;
  movement_kind: "RENTAL" | "REFILL" | null;
  client_phone: string | null;
};

function toIsoDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function emptyContext(): AlertContext {
  return {
    cylinder_id: null,
    cylinder_serial: null,
    client_party_id: null,
    client_name: null,
    counterparty_name: null,
    gas_code: null,
    days_open: null,
    loan_stage: null,
    movement_kind: null,
    client_phone: null,
  };
}

function buildSummary(
  alertType: string,
  ctx: AlertContext,
  entityId: number | null,
): string {
  const serial = ctx.cylinder_serial ? `cyl ${ctx.cylinder_serial}` : null;
  const client = ctx.client_name ? `client ${ctx.client_name}` : null;
  const days = ctx.days_open != null ? `${ctx.days_open}d` : null;
  const kind = ctx.movement_kind;
  const parts = [kind, serial, client, days].filter(Boolean);
  if (parts.length > 0) {
    return `${alertType}: ${parts.join(" · ")}`;
  }
  return `${alertType}${entityId != null ? ` #${entityId}` : ""}`;
}

function baseAlert(row: AlertRow, ctx: AlertContext = emptyContext()): Alert {
  const entityId = row.entity_id == null ? null : Number(row.entity_id);
  return {
    id: Number(row.id),
    alert_type: row.alert_type,
    entity_table: row.entity_table,
    entity_id: entityId,
    severity: Number(row.severity),
    created_at: row.created_at.toISOString(),
    resolved_at: row.resolved_at ? row.resolved_at.toISOString() : null,
    assigned_role: row.assigned_role,
    summary: buildSummary(row.alert_type, ctx, entityId),
    cylinder_id: ctx.cylinder_id,
    cylinder_serial: ctx.cylinder_serial,
    client_party_id: ctx.client_party_id,
    client_name: ctx.client_name,
    counterparty_name: ctx.counterparty_name,
    gas_code: ctx.gas_code,
    days_open: ctx.days_open,
    loan_stage: ctx.loan_stage,
    movement_kind: ctx.movement_kind,
    client_phone: ctx.client_phone,
    contact_note: row.contact_note,
    last_contacted_at: row.last_contacted_at
      ? row.last_contacted_at.toISOString()
      : null,
  };
}

@Injectable()
export class AlertsRepository {
  constructor(
    @Inject(KYSELY) private readonly db: DB,
    private readonly settings: SettingsRepository,
  ) {}

  async list(query: AlertListQuery): Promise<{
    data: Alert[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["created_at"]);

    let qb = db.selectFrom("alert").selectAll();

    if (query.open === true) {
      qb = qb.where("resolved_at", "is", null);
    } else if (query.open === false) {
      qb = qb.where("resolved_at", "is not", null);
    } else if (query.open === undefined) {
      qb = qb.where("resolved_at", "is", null);
    }
    if (query["filter[alert_type]"]) {
      qb = qb.where("alert_type", "=", query["filter[alert_type]"]);
    }
    if (query["filter[assigned_role]"]) {
      qb = qb.where("assigned_role", "=", query["filter[assigned_role]"]);
    }
    if (query["filter[movement_kind]"]) {
      const kind = query["filter[movement_kind]"];
      qb = qb
        .where("entity_table", "=", "movement_event")
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("movement_event")
              .select("movement_event.id")
              .whereRef("movement_event.id", "=", "alert.entity_id")
              .where("movement_event.movement_kind", "=", kind),
          ),
        );
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
    const data = await this.enrichAlerts(pageRows);

    return {
      data,
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                created_at: last.created_at.toISOString(),
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async resolve(id: number): Promise<Alert> {
    const db = resolveDb(this.db);
    const updated = await db
      .updateTable("alert")
      .set({ resolved_at: new Date() })
      .where("id", "=", id)
      .where("resolved_at", "is", null)
      .returningAll()
      .executeTakeFirst();

    if (!updated) {
      const existing = await db
        .selectFrom("alert")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (!existing) throw new Error("NOT_FOUND");
      const [enriched] = await this.enrichAlerts([existing]);
      return enriched!;
    }

    const [enriched] = await this.enrichAlerts([updated]);
    return enriched!;
  }

  async updateContact(id: number, body: UpdateAlertContact): Promise<Alert> {
    const db = resolveDb(this.db);
    const existing = await db
      .selectFrom("alert")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!existing) throw new Error("NOT_FOUND");

    const lastContactedAt =
      body.last_contacted_at === undefined
        ? new Date()
        : body.last_contacted_at === null
          ? null
          : new Date(body.last_contacted_at);

    const updated = await db
      .updateTable("alert")
      .set({
        contact_note: body.contact_note,
        last_contacted_at: lastContactedAt,
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    const [enriched] = await this.enrichAlerts([updated]);
    return enriched!;
  }

  async openCount(): Promise<number> {
    const db = resolveDb(this.db);
    const openCount = await db
      .selectFrom("alert")
      .select((eb) => eb.fn.countAll<string>().as("c"))
      .where("resolved_at", "is", null)
      .executeTakeFirst();
    return Number(openCount?.c ?? 0);
  }

  async refresh(): Promise<RefreshAlertsResult> {
    const db = resolveDb(this.db);
    const asOf = businessTodayIso(
      new Date(),
      await this.settings.getBusinessTimezone(),
    );
    const overdueDays = await this.settings.getSupplierLoanOverdueDays();
    const longOutstandingDays = await this.settings.getLongOutstandingDays();
    let created = 0;

    const openLoans = await db
      .selectFrom("supplier_loan_cycle")
      .select(["id", "received_from_supplier", "stage"])
      .where("returned_to_supplier", "is", null)
      .where("received_from_supplier", "is not", null)
      .execute();

    for (const loan of openLoans) {
      const received = toIsoDate(loan.received_from_supplier);
      if (!received) continue;
      if (calendarDaysBetween(received, asOf) < overdueDays) {
        continue;
      }
      const exists = await db
        .selectFrom("alert")
        .select("id")
        .where("alert_type", "=", "SUPPLIER_LOAN_OVERDUE")
        .where("entity_table", "=", "supplier_loan_cycle")
        .where("entity_id", "=", Number(loan.id))
        .where("resolved_at", "is", null)
        .executeTakeFirst();
      if (exists) continue;
      await db
        .insertInto("alert")
        .values({
          alert_type: "SUPPLIER_LOAN_OVERDUE",
          entity_table: "supplier_loan_cycle",
          entity_id: Number(loan.id),
          severity: 2,
          assigned_role: "INVENTORY",
        })
        .execute();
      created += 1;
    }

    const openMoves = await db
      .selectFrom("movement_event")
      .select(["id", "delivery_date"])
      .where("state", "=", "OPEN")
      .where("return_date", "is", null)
      .execute();

    for (const move of openMoves) {
      const delivery = toIsoDate(move.delivery_date);
      if (!delivery) continue;
      if (calendarDaysBetween(delivery, asOf) < longOutstandingDays) {
        continue;
      }
      const exists = await db
        .selectFrom("alert")
        .select("id")
        .where("alert_type", "=", "LONG_OUTSTANDING")
        .where("entity_table", "=", "movement_event")
        .where("entity_id", "=", Number(move.id))
        .where("resolved_at", "is", null)
        .executeTakeFirst();
      if (exists) continue;
      await db
        .insertInto("alert")
        .values({
          alert_type: "LONG_OUTSTANDING",
          entity_table: "movement_event",
          entity_id: Number(move.id),
          severity: 3,
          assigned_role: "CLERK",
        })
        .execute();
      created += 1;
    }

    // Drop open alerts that no longer meet the configured thresholds
    // (e.g. threshold raised in Configuración, or movement/loan closed).
    const openLongAlerts = await db
      .selectFrom("alert")
      .leftJoin("movement_event", "movement_event.id", "alert.entity_id")
      .select([
        "alert.id",
        "movement_event.delivery_date",
        "movement_event.state",
        "movement_event.return_date",
      ])
      .where("alert.alert_type", "=", "LONG_OUTSTANDING")
      .where("alert.entity_table", "=", "movement_event")
      .where("alert.resolved_at", "is", null)
      .execute();

    for (const row of openLongAlerts) {
      const delivery = toIsoDate(row.delivery_date);
      const stillOpen =
        row.state === "OPEN" && row.return_date == null && delivery != null;
      const meetsThreshold =
        stillOpen &&
        calendarDaysBetween(delivery!, asOf) >= longOutstandingDays;
      if (meetsThreshold) continue;
      await db
        .updateTable("alert")
        .set({ resolved_at: new Date() })
        .where("id", "=", Number(row.id))
        .where("resolved_at", "is", null)
        .execute();
    }

    const openLoanAlerts = await db
      .selectFrom("alert")
      .leftJoin(
        "supplier_loan_cycle",
        "supplier_loan_cycle.id",
        "alert.entity_id",
      )
      .select([
        "alert.id",
        "supplier_loan_cycle.received_from_supplier",
        "supplier_loan_cycle.returned_to_supplier",
      ])
      .where("alert.alert_type", "=", "SUPPLIER_LOAN_OVERDUE")
      .where("alert.entity_table", "=", "supplier_loan_cycle")
      .where("alert.resolved_at", "is", null)
      .execute();

    for (const row of openLoanAlerts) {
      const received = toIsoDate(row.received_from_supplier);
      const stillOpen = row.returned_to_supplier == null && received != null;
      const meetsThreshold =
        stillOpen && calendarDaysBetween(received!, asOf) >= overdueDays;
      if (meetsThreshold) continue;
      await db
        .updateTable("alert")
        .set({ resolved_at: new Date() })
        .where("id", "=", Number(row.id))
        .where("resolved_at", "is", null)
        .execute();
    }

    const open_count = await this.openCount();

    return {
      created,
      open_count,
    };
  }

  private async enrichAlerts(rows: AlertRow[]): Promise<Alert[]> {
    if (rows.length === 0) return [];

    const db = resolveDb(this.db);
    const asOf = businessTodayIso(
      new Date(),
      await this.settings.getBusinessTimezone(),
    );

    const movementIds = rows
      .filter(
        (row) => row.entity_table === "movement_event" && row.entity_id != null,
      )
      .map((row) => Number(row.entity_id));
    const loanIds = rows
      .filter(
        (row) =>
          row.entity_table === "supplier_loan_cycle" && row.entity_id != null,
      )
      .map((row) => Number(row.entity_id));
    const cylinderIds = rows
      .filter((row) => row.entity_table === "cylinder" && row.entity_id != null)
      .map((row) => Number(row.entity_id));

    const movementCtx = new Map<number, AlertContext>();
    if (movementIds.length > 0) {
      const moves = await db
        .selectFrom("movement_event")
        .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
        .innerJoin("party", "party.id", "movement_event.holder_party_id")
        .select([
          "movement_event.id",
          "movement_event.cylinder_id",
          "movement_event.holder_party_id",
          "movement_event.delivery_date",
          "movement_event.gas_code",
          "movement_event.movement_kind",
          "cylinder.serial_number",
          "party.display_name",
        ])
        .where("movement_event.id", "in", movementIds)
        .execute();

      for (const move of moves) {
        const delivery = toIsoDate(move.delivery_date);
        movementCtx.set(Number(move.id), {
          cylinder_id: Number(move.cylinder_id),
          cylinder_serial: move.serial_number,
          client_party_id: Number(move.holder_party_id),
          client_name: move.display_name,
          counterparty_name: null,
          gas_code: move.gas_code,
          days_open: delivery ? calendarDaysBetween(delivery, asOf) : null,
          loan_stage: null,
          movement_kind: move.movement_kind,
          client_phone: null,
        });
      }
    }

    const loanCtx = new Map<number, AlertContext>();
    if (loanIds.length > 0) {
      const loans = await db
        .selectFrom("supplier_loan_cycle")
        .innerJoin("cylinder", "cylinder.id", "supplier_loan_cycle.cylinder_id")
        .innerJoin(
          "party as supplier",
          "supplier.id",
          "supplier_loan_cycle.supplier_party_id",
        )
        .leftJoin(
          "party as client",
          "client.id",
          "supplier_loan_cycle.client_party_id",
        )
        .select([
          "supplier_loan_cycle.id",
          "supplier_loan_cycle.cylinder_id",
          "supplier_loan_cycle.client_party_id",
          "supplier_loan_cycle.received_from_supplier",
          "supplier_loan_cycle.gas_code",
          "supplier_loan_cycle.stage",
          "cylinder.serial_number",
          "supplier.display_name as supplier_name",
          "client.display_name as client_name",
        ])
        .where("supplier_loan_cycle.id", "in", loanIds)
        .execute();

      for (const loan of loans) {
        const received = toIsoDate(loan.received_from_supplier);
        loanCtx.set(Number(loan.id), {
          cylinder_id: Number(loan.cylinder_id),
          cylinder_serial: loan.serial_number,
          client_party_id:
            loan.client_party_id == null ? null : Number(loan.client_party_id),
          client_name: loan.client_name,
          counterparty_name: loan.supplier_name,
          gas_code: loan.gas_code,
          days_open: received ? calendarDaysBetween(received, asOf) : null,
          loan_stage: loan.stage,
          movement_kind: null,
          client_phone: null,
        });
      }
    }

    const cylinderCtx = new Map<number, AlertContext>();
    if (cylinderIds.length > 0) {
      const cylinders = await db
        .selectFrom("cylinder")
        .innerJoin("party as owner", "owner.id", "cylinder.owner_party_id")
        .select([
          "cylinder.id",
          "cylinder.serial_number",
          "cylinder.gas_code",
          "owner.display_name as owner_name",
        ])
        .where("cylinder.id", "in", cylinderIds)
        .execute();

      const holders = await db
        .selectFrom("movement_event")
        .innerJoin("party", "party.id", "movement_event.holder_party_id")
        .select([
          "movement_event.cylinder_id",
          "movement_event.holder_party_id",
          "party.display_name",
          "movement_event.delivery_date",
          "movement_event.id",
        ])
        .where("movement_event.cylinder_id", "in", cylinderIds)
        .where("movement_event.state", "in", ["OPEN", "LOST"])
        .orderBy("movement_event.delivery_date", "desc")
        .orderBy("movement_event.id", "desc")
        .execute();

      const holderByCylinder = new Map<
        number,
        { holder_party_id: number; display_name: string }
      >();
      for (const head of holders) {
        const cylId = Number(head.cylinder_id);
        if (!holderByCylinder.has(cylId)) {
          holderByCylinder.set(cylId, {
            holder_party_id: Number(head.holder_party_id),
            display_name: head.display_name,
          });
        }
      }

      for (const cyl of cylinders) {
        const cylId = Number(cyl.id);
        const holder = holderByCylinder.get(cylId);
        cylinderCtx.set(cylId, {
          cylinder_id: cylId,
          cylinder_serial: cyl.serial_number,
          client_party_id: holder?.holder_party_id ?? null,
          client_name: holder?.display_name ?? null,
          counterparty_name: cyl.owner_name,
          gas_code: cyl.gas_code,
          days_open: null,
          loan_stage: null,
          movement_kind: null,
          client_phone: null,
        });
      }
    }

    const partyIds = new Set<number>();
    for (const ctx of [
      ...movementCtx.values(),
      ...loanCtx.values(),
      ...cylinderCtx.values(),
    ]) {
      if (ctx.client_party_id != null) partyIds.add(ctx.client_party_id);
    }

    const phoneByParty = new Map<number, string>();
    if (partyIds.size > 0) {
      const contacts = await db
        .selectFrom("client_contact")
        .select(["client_party_id", "phone", "is_primary"])
        .where("client_party_id", "in", [...partyIds])
        .where("phone", "is not", null)
        .orderBy("is_primary", "desc")
        .orderBy("id", "asc")
        .execute();

      for (const item of contacts) {
        const partyId = Number(item.client_party_id);
        if (!phoneByParty.has(partyId) && item.phone) {
          phoneByParty.set(partyId, item.phone);
        }
      }
    }

    const attachPhone = (ctx: AlertContext): AlertContext => {
      if (ctx.client_party_id == null) return ctx;
      return {
        ...ctx,
        client_phone: phoneByParty.get(ctx.client_party_id) ?? null,
      };
    };

    return rows.map((row) => {
      const entityId = row.entity_id == null ? null : Number(row.entity_id);
      let ctx = emptyContext();
      if (entityId != null) {
        if (row.entity_table === "movement_event") {
          ctx = movementCtx.get(entityId) ?? ctx;
        } else if (row.entity_table === "supplier_loan_cycle") {
          ctx = loanCtx.get(entityId) ?? ctx;
        } else if (row.entity_table === "cylinder") {
          ctx = cylinderCtx.get(entityId) ?? ctx;
        }
      }
      return baseAlert(row, attachPhone(ctx));
    });
  }
}

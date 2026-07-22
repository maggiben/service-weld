import { Inject, Injectable } from "@nestjs/common";
import {
  billableDaysInPeriod,
  businessTodayIso,
  resolveBillingUnitPrice,
  rentalChargeAmount,
} from "@weld/domain";
import type {
  BillingRunDetail,
  ChargeLine,
  CreateBillingRunInput,
  Invoice,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import { RatesRepository } from "../rates/rates.repository";

interface BillableMovement {
  id: number;
  holder_party_id: number;
  holder_name: string;
  holder_locality_id: number | null;
  holder_locality_name: string | null;
  daily_rate_default: string | number | null;
  gas_code: string | null;
  capacity_m3: string | number | null;
  capacity_unit: "M3" | "KG";
  delivery_date: string | Date;
  return_date: string | Date | null;
  cylinder_serial: string;
}

function toIsoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class BillingRepository {
  constructor(
    @Inject(KYSELY) private readonly db: DB,
    private readonly ratesRepository: RatesRepository,
  ) {}

  async createDraftRun(
    input: CreateBillingRunInput,
    actorUserId: number,
  ): Promise<BillingRunDetail> {
    const db = resolveDb(this.db);

    const isHistory = input.mode === "history";
    const today = businessTodayIso();

    let periodStart: string;
    let periodEnd: string;

    if (isHistory) {
      // Ignore any client-supplied dates: from the oldest still-open rental
      // delivery in scope through today. Each charge line still accrues from
      // that movement's own delivery_date (not the UI From/To pickers).
      let oldestQb = db
        .selectFrom("movement_event")
        .innerJoin(
          "client",
          "client.party_id",
          "movement_event.holder_party_id",
        )
        .select((eb) => eb.fn.min("movement_event.delivery_date").as("oldest"))
        .where("movement_event.movement_kind", "=", "RENTAL")
        .where("movement_event.state", "!=", "VOID")
        .where("movement_event.property_basis", "in", ["OURS", "SUPPLIER"])
        .where("movement_event.return_date", "is", null)
        .where("movement_event.delivery_date", "<=", today);

      if (input.client_party_id != null) {
        oldestQb = oldestQb.where(
          "movement_event.holder_party_id",
          "=",
          input.client_party_id,
        );
      } else if (input.locality_id != null) {
        oldestQb = oldestQb.where("client.locality_id", "=", input.locality_id);
      } else if (input.territory_id != null) {
        oldestQb = oldestQb.where(
          "client.territory_id",
          "=",
          input.territory_id,
        );
      }

      const oldestRow = await oldestQb.executeTakeFirst();
      const oldest = toIsoDate(
        (oldestRow?.oldest as string | Date | null | undefined) ?? null,
      );
      if (!oldest) {
        // No open rentals in scope — still create an empty run dated today.
        periodStart = today;
        periodEnd = today;
      } else {
        periodStart = oldest;
        periodEnd = today;
      }
    } else {
      if (!input.period_start || !input.period_end) {
        throw ApiErrors.validationFailed("Invalid period", [
          { field: "period_start", issue: "Required for period mode" },
          { field: "period_end", issue: "Required for period mode" },
        ]);
      }
      if (input.period_end < input.period_start) {
        throw ApiErrors.validationFailed("Invalid period", [
          { field: "period_end", issue: "Must be on or after period_start" },
        ]);
      }
      periodStart = input.period_start;
      periodEnd = input.period_end;
    }

    if (input.client_party_id != null) {
      const client = await db
        .selectFrom("client")
        .select("party_id")
        .where("party_id", "=", input.client_party_id)
        .executeTakeFirst();
      if (!client) {
        throw ApiErrors.validationFailed("Unknown client", [
          { field: "client_party_id", issue: "Client not found" },
        ]);
      }
    }

    if (input.locality_id != null) {
      const locality = await db
        .selectFrom("locality")
        .select("id")
        .where("id", "=", input.locality_id)
        .executeTakeFirst();
      if (!locality) {
        throw ApiErrors.validationFailed("Unknown locality", [
          { field: "locality_id", issue: "Locality not found" },
        ]);
      }
    }

    if (input.territory_id != null) {
      const territory = await db
        .selectFrom("dispatch_territory")
        .select("id")
        .where("id", "=", input.territory_id)
        .executeTakeFirst();
      if (!territory) {
        throw ApiErrors.validationFailed("Unknown territory", [
          { field: "territory_id", issue: "Territory not found" },
        ]);
      }
    }

    // Clients with APPROVED/EXPORTED invoices for this exact period are locked.
    // Single-client runs fail hard; multi-client runs skip those clients.
    let lockedQb = db
      .selectFrom("invoice")
      .innerJoin("client", "client.party_id", "invoice.client_party_id")
      .select("invoice.client_party_id")
      .where("invoice.period_start", "=", periodStart)
      .where("invoice.period_end", "=", periodEnd)
      .where("invoice.status", "in", ["APPROVED", "EXPORTED"]);

    if (input.client_party_id != null) {
      lockedQb = lockedQb.where(
        "invoice.client_party_id",
        "=",
        input.client_party_id,
      );
    } else if (input.locality_id != null) {
      lockedQb = lockedQb.where("client.locality_id", "=", input.locality_id);
    } else if (input.territory_id != null) {
      lockedQb = lockedQb.where("client.territory_id", "=", input.territory_id);
    }

    const lockedRows = await lockedQb.execute();
    const lockedClientIds = new Set(
      lockedRows.map((r) => Number(r.client_party_id)),
    );

    if (
      input.client_party_id != null &&
      lockedClientIds.has(input.client_party_id)
    ) {
      throw ApiErrors.conflict(
        "PERIOD_LOCKED",
        "Period already has approved/exported invoices",
      );
    }

    // Replace prior drafts for the same period / client / locality / territory scope.
    // History also clears legacy sentinel drafts (1970-01-01) from earlier builds.
    let priorDraftsQb = db
      .selectFrom("invoice")
      .innerJoin("client", "client.party_id", "invoice.client_party_id")
      .select("invoice.id")
      .where("invoice.status", "=", "DRAFT");

    if (isHistory) {
      priorDraftsQb = priorDraftsQb.where((eb) =>
        eb.or([
          eb.and([
            eb("invoice.period_start", "=", periodStart),
            eb("invoice.period_end", "=", periodEnd),
          ]),
          eb("invoice.period_start", "=", "1970-01-01"),
        ]),
      );
    } else {
      priorDraftsQb = priorDraftsQb
        .where("invoice.period_start", "=", periodStart)
        .where("invoice.period_end", "=", periodEnd);
    }

    if (input.client_party_id != null) {
      priorDraftsQb = priorDraftsQb.where(
        "invoice.client_party_id",
        "=",
        input.client_party_id,
      );
    } else if (input.locality_id != null) {
      priorDraftsQb = priorDraftsQb.where(
        "client.locality_id",
        "=",
        input.locality_id,
      );
    } else if (input.territory_id != null) {
      priorDraftsQb = priorDraftsQb.where(
        "client.territory_id",
        "=",
        input.territory_id,
      );
    }

    const priorDrafts = await priorDraftsQb.execute();

    if (priorDrafts.length > 0) {
      const ids = priorDrafts.map((r) => Number(r.id));
      await db
        .deleteFrom("charge_line")
        .where("invoice_id", "in", ids)
        .execute();
      await db.deleteFrom("invoice").where("id", "in", ids).execute();
    }

    const run = await db
      .insertInto("billing_run")
      .values({
        period_start: periodStart,
        period_end: periodEnd,
        client_party_id: input.client_party_id ?? null,
        status: "DRAFT",
        created_by: actorUserId,
      })
      .returning([
        "id",
        "period_start",
        "period_end",
        "client_party_id",
        "status",
        "created_at",
      ])
      .executeTakeFirstOrThrow();

    // Only holders that are actual clients — localities/territories etc. must not
    // become invoice.client_party_id (FK to client).
    let movementsQb = db
      .selectFrom("movement_event")
      .innerJoin("client", "client.party_id", "movement_event.holder_party_id")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .leftJoin("locality", "locality.id", "client.locality_id")
      .select([
        "movement_event.id",
        "movement_event.holder_party_id",
        "party.display_name as holder_name",
        "client.locality_id as holder_locality_id",
        "locality.name as holder_locality_name",
        "client.daily_rate_default",
        "movement_event.gas_code",
        "cylinder.capacity_m3",
        "cylinder.capacity_unit",
        "movement_event.delivery_date",
        "movement_event.return_date",
        "cylinder.serial_number as cylinder_serial",
      ])
      .where("movement_event.movement_kind", "=", "RENTAL")
      .where("movement_event.state", "!=", "VOID")
      .where("movement_event.property_basis", "in", ["OURS", "SUPPLIER"]);

    if (isHistory) {
      // Outstanding stock only: never returned, any delivery date up to today.
      movementsQb = movementsQb
        .where("movement_event.return_date", "is", null)
        .where("movement_event.delivery_date", "<=", periodEnd);
    } else {
      // Period mode: movements that overlap the window (closed + open-accrued).
      // Same rule as the rental report — a cylinder out since 2020 still bills
      // the days that fall inside [periodStart, periodEnd] (009 AC4 / W20).
      movementsQb = movementsQb
        .where("movement_event.delivery_date", "<=", periodEnd)
        .where((eb) =>
          eb.or([
            eb("movement_event.return_date", "is", null),
            eb("movement_event.return_date", ">=", periodStart),
          ]),
        );
    }

    if (input.client_party_id != null) {
      movementsQb = movementsQb.where(
        "movement_event.holder_party_id",
        "=",
        input.client_party_id,
      );
    } else if (input.locality_id != null) {
      movementsQb = movementsQb.where(
        "client.locality_id",
        "=",
        input.locality_id,
      );
    } else if (input.territory_id != null) {
      movementsQb = movementsQb.where(
        "client.territory_id",
        "=",
        input.territory_id,
      );
    }

    const movements = (await movementsQb.execute()) as BillableMovement[];
    const rates = await this.ratesRepository.listAllCandidates();

    const byClient = new Map<
      number,
      {
        name: string;
        locality_id: number | null;
        locality_name: string | null;
        lines: Omit<ChargeLine, "id" | "invoice_id">[];
      }
    >();

    for (const movement of movements) {
      const holderId = Number(movement.holder_party_id);
      if (lockedClientIds.has(holderId)) continue;

      const delivery = toIsoDate(movement.delivery_date)!;
      const ret = toIsoDate(movement.return_date);
      // Open rentals accrue only through business today (009 AC4), not the
      // future end of a mid-month period window (e.g. 323214 billed 10 phantom days).
      const days = billableDaysInPeriod({
        deliveryDate: delivery,
        returnDate: ret,
        periodStart,
        periodEnd,
        asOfDate: today,
      });
      if (days <= 0) continue;

      const capacityM3 =
        movement.capacity_m3 == null ? null : Number(movement.capacity_m3);
      const capacityUnit = movement.capacity_unit ?? "M3";
      const unit = resolveBillingUnitPrice({
        rates,
        clientPartyId: holderId,
        gasCode: movement.gas_code,
        capacityM3,
        capacityUnit,
        mode: isHistory ? "history" : "period",
        deliveryDate: delivery,
        periodStart,
        periodEnd,
        dailyRateDefault:
          movement.daily_rate_default == null
            ? null
            : Number(movement.daily_rate_default),
      });
      if (!unit) continue;

      const amount = rentalChargeAmount(days, unit);
      const bucket = byClient.get(holderId) ?? {
        name: movement.holder_name,
        locality_id:
          movement.holder_locality_id == null
            ? null
            : Number(movement.holder_locality_id),
        locality_name: movement.holder_locality_name,
        lines: [],
      };
      const gasLabel = movement.gas_code ? ` · ${movement.gas_code}` : "";
      const sizeSuffix = capacityUnit === "KG" ? " kg" : " m³";
      const sizeLabel =
        capacityM3 != null ? ` · ${capacityM3}${sizeSuffix}` : "";
      const billStart = delivery > periodStart ? delivery : periodStart;
      const billEnd = ret
        ? ret < periodEnd
          ? ret
          : periodEnd
        : today < periodEnd
          ? today
          : periodEnd;
      const rangeLabel = `${billStart}→${billEnd}`;
      bucket.lines.push({
        source_table: "movement_event",
        source_id: Number(movement.id),
        description: isHistory
          ? `Alquiler abierto ${movement.cylinder_serial}${gasLabel}${sizeLabel} (${days} d desde ${delivery})`
          : `Alquiler ${movement.cylinder_serial}${gasLabel}${sizeLabel} (${days} d · ${rangeLabel})`,
        quantity: days,
        unit: "day",
        unit_price: unit.amount,
        amount: amount.amount,
      });
      byClient.set(holderId, bucket);
    }

    const invoices: Invoice[] = [];

    for (const [clientId, bucket] of byClient) {
      const total = bucket.lines.reduce((sum, line) => sum + line.amount, 0);
      const totalDays = bucket.lines.reduce(
        (sum, line) => sum + line.quantity,
        0,
      );
      const inv = await db
        .insertInto("invoice")
        .values({
          client_party_id: clientId,
          period_start: periodStart,
          period_end: periodEnd,
          status: "DRAFT",
          total: String(Math.round(total * 100) / 100),
          billing_run_id: Number(run.id),
        })
        .returning([
          "id",
          "client_party_id",
          "period_start",
          "period_end",
          "status",
          "total",
          "billing_run_id",
          "created_at",
          "version",
        ])
        .executeTakeFirstOrThrow();

      const chargeLines: ChargeLine[] = [];
      for (const line of bucket.lines) {
        const inserted = await db
          .insertInto("charge_line")
          .values({
            invoice_id: Number(inv.id),
            source_table: line.source_table,
            source_id: line.source_id,
            description: line.description,
            quantity: String(line.quantity),
            unit: line.unit,
            unit_price: String(line.unit_price),
            amount: String(line.amount),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        chargeLines.push({
          id: Number(inserted.id),
          invoice_id: Number(inserted.invoice_id),
          source_table: inserted.source_table,
          source_id: Number(inserted.source_id),
          description: inserted.description,
          quantity: Number(inserted.quantity),
          unit: inserted.unit,
          unit_price: Number(inserted.unit_price),
          amount: Number(inserted.amount),
        });
      }

      invoices.push({
        id: Number(inv.id),
        billing_run_id: Number(inv.billing_run_id),
        client_party_id: Number(inv.client_party_id),
        client_name: bucket.name,
        client_locality_id: bucket.locality_id,
        client_locality_name: bucket.locality_name,
        period_start: toIsoDate(inv.period_start as string | Date)!,
        period_end: toIsoDate(inv.period_end as string | Date)!,
        status: inv.status,
        total: Number(inv.total),
        total_days: totalDays,
        created_at: (inv.created_at as Date).toISOString(),
        version: Number(inv.version),
        charge_lines: chargeLines,
      });
    }

    const runTotal = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const runTotalDays = invoices.reduce(
      (sum, inv) => sum + (inv.total_days ?? 0),
      0,
    );

    return {
      id: Number(run.id),
      period_start: toIsoDate(run.period_start as string | Date)!,
      period_end: toIsoDate(run.period_end as string | Date)!,
      client_party_id:
        run.client_party_id == null ? null : Number(run.client_party_id),
      status: run.status,
      created_at: (run.created_at as Date).toISOString(),
      invoice_count: invoices.length,
      total: Math.round(runTotal * 100) / 100,
      total_days: runTotalDays,
      invoices,
    };
  }

  async getRun(id: number): Promise<BillingRunDetail | null> {
    const db = resolveDb(this.db);
    const run = await db
      .selectFrom("billing_run")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!run) return null;

    const invoices = await db
      .selectFrom("invoice")
      .innerJoin("party", "party.id", "invoice.client_party_id")
      .innerJoin("client", "client.party_id", "invoice.client_party_id")
      .leftJoin("locality", "locality.id", "client.locality_id")
      .select([
        "invoice.id",
        "invoice.billing_run_id",
        "invoice.client_party_id",
        "party.display_name as client_name",
        "client.locality_id as client_locality_id",
        "locality.name as client_locality_name",
        "invoice.period_start",
        "invoice.period_end",
        "invoice.status",
        "invoice.total",
        "invoice.created_at",
        "invoice.version",
      ])
      .where("invoice.billing_run_id", "=", id)
      .execute();

    const mapped: Invoice[] = [];
    for (const inv of invoices) {
      const lines = await db
        .selectFrom("charge_line")
        .selectAll()
        .where("invoice_id", "=", inv.id)
        .execute();
      const chargeLines = lines.map((line) => ({
        id: Number(line.id),
        invoice_id: Number(line.invoice_id),
        source_table: line.source_table,
        source_id: Number(line.source_id),
        description: line.description,
        quantity: Number(line.quantity),
        unit: line.unit,
        unit_price: Number(line.unit_price),
        amount: Number(line.amount),
      }));
      const totalDays = chargeLines.reduce(
        (sum, line) => sum + line.quantity,
        0,
      );
      mapped.push({
        id: Number(inv.id),
        billing_run_id:
          inv.billing_run_id == null ? null : Number(inv.billing_run_id),
        client_party_id: Number(inv.client_party_id),
        client_name: inv.client_name as string,
        client_locality_id:
          inv.client_locality_id == null
            ? null
            : Number(inv.client_locality_id),
        client_locality_name:
          (inv.client_locality_name as string | null) ?? null,
        period_start: toIsoDate(inv.period_start as string | Date)!,
        period_end: toIsoDate(inv.period_end as string | Date)!,
        status: inv.status,
        total: Number(inv.total),
        total_days: totalDays,
        created_at: (inv.created_at as Date).toISOString(),
        version: Number(inv.version),
        charge_lines: chargeLines,
      });
    }

    const total = mapped.reduce((sum, inv) => sum + inv.total, 0);
    const totalDays = mapped.reduce(
      (sum, inv) => sum + (inv.total_days ?? 0),
      0,
    );
    return {
      id: Number(run.id),
      period_start: toIsoDate(run.period_start as string | Date)!,
      period_end: toIsoDate(run.period_end as string | Date)!,
      client_party_id:
        run.client_party_id == null ? null : Number(run.client_party_id),
      status: run.status,
      created_at: (run.created_at as Date).toISOString(),
      invoice_count: mapped.length,
      total: Math.round(total * 100) / 100,
      total_days: totalDays,
      invoices: mapped,
    };
  }

  async approveRun(id: number): Promise<BillingRunDetail> {
    const db = resolveDb(this.db);
    const run = await this.getRun(id);
    if (!run) throw ApiErrors.notFound("Billing run not found");
    if (run.status !== "DRAFT") {
      throw ApiErrors.conflict(
        "NOT_DRAFT",
        "Only DRAFT billing runs can be approved",
      );
    }
    if (run.invoices.length === 0) {
      throw ApiErrors.conflict(
        "UNRESOLVED_LINES",
        "Billing run has no invoices to approve",
      );
    }

    await db
      .updateTable("billing_run")
      .set({ status: "APPROVED" })
      .where("id", "=", id)
      .where("status", "=", "DRAFT")
      .execute();

    await db
      .updateTable("invoice")
      .set({ status: "APPROVED" })
      .where("billing_run_id", "=", id)
      .where("status", "=", "DRAFT")
      .execute();

    const approved = await this.getRun(id);
    if (!approved)
      throw ApiErrors.notFound("Billing run not found after approve");
    return approved;
  }

  async exportRun(id: number): Promise<{
    run_id: number;
    exported_at: string;
    period_start: string;
    period_end: string;
    invoices: Array<{
      invoice_id: number;
      client_party_id: number;
      client_name?: string;
      total: number;
      lines: Array<{
        source_table: string;
        source_id: number;
        description: string;
        quantity: number;
        unit: string;
        unit_price: number;
        amount: number;
      }>;
    }>;
  }> {
    const db = resolveDb(this.db);
    const run = await this.getRun(id);
    if (!run) throw ApiErrors.notFound("Billing run not found");
    if (run.status !== "APPROVED" && run.status !== "EXPORTED") {
      throw ApiErrors.conflict(
        "NOT_APPROVED",
        "Billing run must be APPROVED before export",
      );
    }

    if (run.status === "APPROVED") {
      await db
        .updateTable("billing_run")
        .set({ status: "EXPORTED" })
        .where("id", "=", id)
        .execute();
      await db
        .updateTable("invoice")
        .set({ status: "EXPORTED" })
        .where("billing_run_id", "=", id)
        .where("status", "=", "APPROVED")
        .execute();
    }

    return {
      run_id: run.id,
      exported_at: new Date().toISOString(),
      period_start: run.period_start,
      period_end: run.period_end,
      invoices: run.invoices.map((inv) => ({
        invoice_id: inv.id,
        client_party_id: inv.client_party_id,
        client_name: inv.client_name,
        total: inv.total,
        lines: (inv.charge_lines ?? []).map((line) => ({
          source_table: line.source_table,
          source_id: line.source_id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          amount: line.amount,
        })),
      })),
    };
  }

  async movementHasLockedCharges(movementId: number): Promise<boolean> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("charge_line")
      .innerJoin("invoice", "invoice.id", "charge_line.invoice_id")
      .select("charge_line.id")
      .where("charge_line.source_table", "=", "movement_event")
      .where("charge_line.source_id", "=", movementId)
      .where("invoice.status", "in", ["APPROVED", "EXPORTED"])
      .executeTakeFirst();
    return Boolean(row);
  }
}

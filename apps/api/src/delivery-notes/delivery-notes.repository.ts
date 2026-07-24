import { Inject, Injectable } from "@nestjs/common";
import { paperKindForRemitoType, remitoTypeForPaperKind } from "@weld/domain";
import { allocateRemitoNumber } from "./allocate-remito-number";
import type {
  CreateDeliveryNoteInput,
  CreateDriverProfileInput,
  CreateRemitoIncidentInput,
  CreateRemitoLineInput,
  CreateVehicleInput,
  DeliveryNote,
  DeliveryNoteDetail,
  DeliveryNoteLinkedMovement,
  DeliveryNoteLinkedRental,
  DeliveryNoteListQuery,
  DriverListQuery,
  DriverProfile,
  PickingStatus,
  RemitoIncident,
  RemitoLine,
  RemitoPrintLog,
  RemitoSeries,
  RemitoStatus,
  RemitoStatusHistoryEntry,
  RemitoType,
  PrintCopyKind,
  UpdateDeliveryNoteInput,
  UpdateRemitoIncidentInput,
  UpdateRemitoLineInput,
  Vehicle,
  VehicleListQuery,
  Warehouse,
  WarehouseListQuery,
} from "@weld/schemas";
import { sql } from "kysely";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import type {
  AccessoryRentalState,
  AccessoryType,
  CapacityUnit,
  ChargeBasis,
  CylinderCondition,
  DeliveryNoteKind,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  MovementKind,
  MovementState,
  OwnershipBasis,
  RemitoLineKind,
  RemitoPriority,
} from "../database/schema.types";
import { resolveDb } from "../database/transaction.context";

interface DeliveryNoteRow {
  id: number;
  remito_number: string;
  series_id: number | null;
  series_code: string | null;
  kind: DeliveryNoteKind;
  remito_type: RemitoType;
  status: RemitoStatus;
  picking_status: PickingStatus;
  priority: RemitoPriority;
  issued_date: string | Date | null;
  scheduled_delivery_at: string | Date | null;
  departure_at: string | Date | null;
  arrival_at: string | Date | null;
  closed_at: string | Date | null;
  client_party_id: number | null;
  client_name: string | null;
  origin_warehouse_id: number | null;
  origin_warehouse_name: string | null;
  destination_warehouse_id: number | null;
  driver_id: number | null;
  driver_name: string | null;
  helper_id: number | null;
  helper_name: string | null;
  vehicle_id: number | null;
  vehicle_plate: string | null;
  observations: string | null;
  cancel_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  line_count?: string | number | null;
  movement_count?: string | number | null;
  accessory_rental_count?: string | number | null;
}

interface LinkedMovementRow {
  id: number;
  cylinder_id: number;
  cylinder_serial: string;
  gas_code: string | null;
  capacity_m3: string | number | null;
  capacity_unit: CapacityUnit | null;
  condition: CylinderCondition | null;
  holder_party_id: number;
  holder_name: string;
  movement_kind: MovementKind;
  delivery_date: string | Date;
  return_date: string | Date | null;
  state: MovementState;
}

interface LinkedRentalRow {
  id: number;
  accessory_id: number;
  accessory_type: AccessoryType;
  accessory_identifier: string | null;
  client_party_id: number;
  client_name: string;
  start_date: string | Date;
  end_date: string | Date | null;
  charge_basis: ChargeBasis;
  state: AccessoryRentalState;
}

interface StatusHistoryRow {
  id: number;
  from_status: RemitoStatus | null;
  to_status: RemitoStatus;
  actor_user_id: number | null;
  note: string | null;
  at: Date;
}

interface RemitoLineRow {
  id: number;
  remito_id: number;
  line_no: number;
  item_kind: RemitoLineKind;
  cylinder_id: number | null;
  battery_id: number | null;
  accessory_id: number | null;
  serial_number: string | null;
  gas_code: string | null;
  capacity_value: string | number | null;
  capacity_unit: CapacityUnit | null;
  owner_party_id: number | null;
  is_rental: boolean;
  ownership_basis: OwnershipBasis | null;
  qty: string | number;
  picked_qty: string | number;
  delivered_qty: string | number | null;
  returned_qty: string | number | null;
  unit: string | null;
  pressure: string | number | null;
  condition: CylinderCondition | null;
  barcode: string | null;
  qr_code: string | null;
  movement_event_id: number | null;
  accessory_rental_id: number | null;
  weight_kg: string | number | null;
  notes: string | null;
  scanned_at: string | Date | null;
}

interface RemitoIncidentRow {
  id: number;
  remito_id: number;
  line_id: number | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  description: string;
  reported_by: number | null;
  reported_at: Date;
  resolution: string | null;
  resolved_by: number | null;
  resolved_at: string | Date | null;
}

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function isoDateTime(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  return value.toISOString();
}

function toCount(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

function mapNote(row: DeliveryNoteRow): DeliveryNote {
  return {
    id: Number(row.id),
    remito_number: row.remito_number,
    series_id: row.series_id == null ? null : Number(row.series_id),
    series_code: row.series_code,
    kind: row.kind,
    remito_type: row.remito_type,
    status: row.status,
    picking_status: row.picking_status,
    priority: row.priority,
    issued_date: isoDate(row.issued_date),
    scheduled_delivery_at: isoDateTime(row.scheduled_delivery_at),
    departure_at: isoDateTime(row.departure_at),
    arrival_at: isoDateTime(row.arrival_at),
    closed_at: isoDateTime(row.closed_at),
    client_party_id:
      row.client_party_id == null ? null : Number(row.client_party_id),
    client_name: row.client_name,
    origin_warehouse_id:
      row.origin_warehouse_id == null ? null : Number(row.origin_warehouse_id),
    origin_warehouse_name: row.origin_warehouse_name,
    destination_warehouse_id:
      row.destination_warehouse_id == null
        ? null
        : Number(row.destination_warehouse_id),
    driver_id: row.driver_id == null ? null : Number(row.driver_id),
    driver_name: row.driver_name,
    helper_id: row.helper_id == null ? null : Number(row.helper_id),
    helper_name: row.helper_name,
    vehicle_id: row.vehicle_id == null ? null : Number(row.vehicle_id),
    vehicle_plate: row.vehicle_plate,
    observations: row.observations,
    cancel_reason: row.cancel_reason,
    version: Number(row.version),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    line_count: toCount(row.line_count),
    movement_count: toCount(row.movement_count),
    accessory_rental_count: toCount(row.accessory_rental_count),
  };
}

function mapLinkedMovement(row: LinkedMovementRow): DeliveryNoteLinkedMovement {
  return {
    id: Number(row.id),
    cylinder_id: Number(row.cylinder_id),
    cylinder_serial: row.cylinder_serial,
    gas_code: (row.gas_code as DeliveryNoteLinkedMovement["gas_code"]) ?? null,
    capacity_m3: row.capacity_m3 == null ? null : Number(row.capacity_m3),
    capacity_unit: row.capacity_unit ?? undefined,
    condition: row.condition,
    holder_party_id: Number(row.holder_party_id),
    holder_name: row.holder_name,
    movement_kind: row.movement_kind,
    delivery_date: isoDate(row.delivery_date)!,
    return_date: isoDate(row.return_date),
    state: row.state,
  };
}

function mapLinkedRental(row: LinkedRentalRow): DeliveryNoteLinkedRental {
  return {
    id: Number(row.id),
    accessory_id: Number(row.accessory_id),
    accessory_type: row.accessory_type,
    accessory_identifier: row.accessory_identifier,
    client_party_id: Number(row.client_party_id),
    client_name: row.client_name,
    start_date: isoDate(row.start_date)!,
    end_date: isoDate(row.end_date),
    charge_basis: row.charge_basis,
    state: row.state,
  };
}

function mapHistory(row: StatusHistoryRow): RemitoStatusHistoryEntry {
  return {
    id: Number(row.id),
    from_status: row.from_status,
    to_status: row.to_status,
    actor_user_id: row.actor_user_id == null ? null : Number(row.actor_user_id),
    note: row.note,
    at: row.at.toISOString(),
  };
}

function mapLine(row: RemitoLineRow): RemitoLine {
  return {
    id: Number(row.id),
    remito_id: Number(row.remito_id),
    line_no: Number(row.line_no),
    item_kind: row.item_kind,
    cylinder_id: row.cylinder_id == null ? null : Number(row.cylinder_id),
    battery_id: row.battery_id == null ? null : Number(row.battery_id),
    accessory_id: row.accessory_id == null ? null : Number(row.accessory_id),
    serial_number: row.serial_number,
    gas_code: row.gas_code as RemitoLine["gas_code"],
    capacity_value: toNumber(row.capacity_value),
    capacity_unit: row.capacity_unit,
    owner_party_id:
      row.owner_party_id == null ? null : Number(row.owner_party_id),
    is_rental: row.is_rental,
    ownership_basis: row.ownership_basis,
    qty: Number(row.qty),
    picked_qty: Number(row.picked_qty),
    delivered_qty: toNumber(row.delivered_qty),
    returned_qty: toNumber(row.returned_qty),
    unit: row.unit,
    pressure: toNumber(row.pressure),
    condition: row.condition,
    barcode: row.barcode,
    qr_code: row.qr_code,
    movement_event_id:
      row.movement_event_id == null ? null : Number(row.movement_event_id),
    accessory_rental_id:
      row.accessory_rental_id == null ? null : Number(row.accessory_rental_id),
    weight_kg: toNumber(row.weight_kg),
    notes: row.notes,
    scanned_at: isoDateTime(row.scanned_at),
  };
}

function mapIncident(row: RemitoIncidentRow): RemitoIncident {
  return {
    id: Number(row.id),
    remito_id: Number(row.remito_id),
    line_id: row.line_id == null ? null : Number(row.line_id),
    type: row.type,
    severity: row.severity,
    status: row.status,
    description: row.description,
    reported_by: row.reported_by == null ? null : Number(row.reported_by),
    reported_at: row.reported_at.toISOString(),
    resolution: row.resolution,
    resolved_by: row.resolved_by == null ? null : Number(row.resolved_by),
    resolved_at: isoDateTime(row.resolved_at),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/** Null issued_date sorts as epoch so undated remitos sink on -issued_date. */
const SORT_DATE = sql<string>`coalesce(delivery_note.issued_date, DATE '1970-01-01')`;

const NOTE_SELECT = [
  "delivery_note.id",
  "delivery_note.remito_number",
  "delivery_note.series_id",
  "remito_series.code as series_code",
  "delivery_note.kind",
  "delivery_note.remito_type",
  "delivery_note.status",
  "delivery_note.picking_status",
  "delivery_note.priority",
  "delivery_note.issued_date",
  "delivery_note.scheduled_delivery_at",
  "delivery_note.departure_at",
  "delivery_note.arrival_at",
  "delivery_note.closed_at",
  "delivery_note.client_party_id",
  "delivery_note.origin_warehouse_id",
  "origin_warehouse.name as origin_warehouse_name",
  "delivery_note.destination_warehouse_id",
  "delivery_note.driver_id",
  "driver.display_name as driver_name",
  "delivery_note.helper_id",
  "helper.display_name as helper_name",
  "delivery_note.vehicle_id",
  "vehicle.plate as vehicle_plate",
  "delivery_note.observations",
  "delivery_note.cancel_reason",
  "delivery_note.version",
  "delivery_note.created_at",
  "delivery_note.updated_at",
  "party.display_name as client_name",
] as const;

const LINE_SELECT = [
  "remito_line.id",
  "remito_line.remito_id",
  "remito_line.line_no",
  "remito_line.item_kind",
  "remito_line.cylinder_id",
  "remito_line.battery_id",
  "remito_line.accessory_id",
  "remito_line.serial_number",
  "remito_line.gas_code",
  "remito_line.capacity_value",
  "remito_line.capacity_unit",
  "remito_line.owner_party_id",
  "remito_line.is_rental",
  "remito_line.ownership_basis",
  "remito_line.qty",
  "remito_line.picked_qty",
  "remito_line.delivered_qty",
  "remito_line.returned_qty",
  "remito_line.unit",
  "remito_line.pressure",
  "remito_line.condition",
  "remito_line.barcode",
  "remito_line.qr_code",
  "remito_line.movement_event_id",
  "remito_line.accessory_rental_id",
  "remito_line.weight_kg",
  "remito_line.notes",
  "remito_line.scanned_at",
] as const;

@Injectable()
export class DeliveryNotesRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  private noteBaseQuery() {
    const db = resolveDb(this.db);
    return db
      .selectFrom("delivery_note")
      .leftJoin("party", "party.id", "delivery_note.client_party_id")
      .leftJoin("remito_series", "remito_series.id", "delivery_note.series_id")
      .leftJoin(
        "warehouse as origin_warehouse",
        "origin_warehouse.id",
        "delivery_note.origin_warehouse_id",
      )
      .leftJoin(
        "driver_profile as driver",
        "driver.id",
        "delivery_note.driver_id",
      )
      .leftJoin(
        "driver_profile as helper",
        "helper.id",
        "delivery_note.helper_id",
      )
      .leftJoin("vehicle", "vehicle.id", "delivery_note.vehicle_id")
      .select([
        ...NOTE_SELECT,
        sql<string>`(
          select count(*)::int from remito_line
          where remito_line.remito_id = delivery_note.id
            and remito_line.deleted_at is null
        )`.as("line_count"),
        sql<string>`(
          select count(*)::int from movement_event
          where movement_event.remito_id = delivery_note.id
        )`.as("movement_count"),
        sql<string>`(
          select count(*)::int from accessory_rental
          where accessory_rental.remito_id = delivery_note.id
        )`.as("accessory_rental_count"),
      ]);
  }

  async list(query: DeliveryNoteListQuery): Promise<{
    data: DeliveryNote[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const limit = query.limit;
    const sort = parseSort(query.sort, ["issued_date", "remito_number"]);

    let qb = this.noteBaseQuery().where("delivery_note.deleted_at", "is", null);

    if (query["filter[client_party_id]"] != null) {
      qb = qb.where(
        "delivery_note.client_party_id",
        "=",
        query["filter[client_party_id]"],
      );
    }
    if (query["filter[kind]"]) {
      qb = qb.where("delivery_note.kind", "=", query["filter[kind]"]);
    }
    if (query["filter[remito_type]"]) {
      qb = qb.where(
        "delivery_note.remito_type",
        "=",
        query["filter[remito_type]"],
      );
    }
    if (query["filter[status]"]) {
      qb = qb.where("delivery_note.status", "=", query["filter[status]"]);
    }
    if (query["filter[priority]"]) {
      qb = qb.where("delivery_note.priority", "=", query["filter[priority]"]);
    }
    if (query["filter[picking_status]"]) {
      qb = qb.where(
        "delivery_note.picking_status",
        "=",
        query["filter[picking_status]"],
      );
    }
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([
          eb("delivery_note.remito_number", "ilike", term),
          eb("party.display_name", "ilike", term),
        ]),
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorId = Number(cursor.id ?? 0);
      if (sort.field === "remito_number") {
        const cursorNumber = String(cursor.remito_number ?? "");
        qb =
          sort.direction === "asc"
            ? qb.where((eb) =>
                eb.or([
                  eb("delivery_note.remito_number", ">", cursorNumber),
                  eb.and([
                    eb("delivery_note.remito_number", "=", cursorNumber),
                    eb("delivery_note.id", ">", cursorId),
                  ]),
                ]),
              )
            : qb.where((eb) =>
                eb.or([
                  eb("delivery_note.remito_number", "<", cursorNumber),
                  eb.and([
                    eb("delivery_note.remito_number", "=", cursorNumber),
                    eb("delivery_note.id", "<", cursorId),
                  ]),
                ]),
              );
      } else {
        const cursorDate = String(cursor.sort_date ?? "1970-01-01");
        qb =
          sort.direction === "asc"
            ? qb.where((eb) =>
                eb.or([
                  eb(SORT_DATE, ">", cursorDate),
                  eb.and([
                    eb(SORT_DATE, "=", cursorDate),
                    eb("delivery_note.id", ">", cursorId),
                  ]),
                ]),
              )
            : qb.where((eb) =>
                eb.or([
                  eb(SORT_DATE, "<", cursorDate),
                  eb.and([
                    eb(SORT_DATE, "=", cursorDate),
                    eb("delivery_note.id", "<", cursorId),
                  ]),
                ]),
              );
      }
    }

    if (sort.field === "remito_number") {
      qb = qb
        .orderBy("delivery_note.remito_number", sort.direction)
        .orderBy("delivery_note.id", sort.direction);
    } else {
      qb = qb
        .orderBy(SORT_DATE, sort.direction)
        .orderBy("delivery_note.id", sort.direction);
    }

    const rows = (await qb.limit(limit + 1).execute()) as DeliveryNoteRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];

    const nextCursor =
      hasMore && last
        ? encodeCursor({
            id: Number(last.id),
            remito_number: last.remito_number,
            sort_date: isoDate(last.issued_date) ?? "1970-01-01",
          })
        : null;

    return {
      data: pageRows.map(mapNote),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor,
      }),
    };
  }

  async getById(id: number): Promise<DeliveryNote | null> {
    const row = (await this.noteBaseQuery()
      .where("delivery_note.id", "=", id)
      .where("delivery_note.deleted_at", "is", null)
      .executeTakeFirst()) as DeliveryNoteRow | undefined;
    return row ? mapNote(row) : null;
  }

  async getDetail(id: number): Promise<DeliveryNoteDetail | null> {
    const note = await this.getById(id);
    if (!note) return null;

    const [movements, rentals, history, lines, incidents] = await Promise.all([
      this.listLinkedMovements(id),
      this.listLinkedRentals(id),
      this.listStatusHistory(id),
      this.listLines(id),
      this.listIncidents(id),
    ]);

    return {
      ...note,
      lines,
      incidents,
      movements,
      accessory_rentals: rentals,
      status_history: history,
    };
  }

  async allocateNumber(opts?: {
    seriesId?: number;
    seriesCode?: string;
  }): Promise<{ seriesId: number; remitoNumber: string }> {
    return allocateRemitoNumber(resolveDb(this.db), opts);
  }

  async create(
    input: CreateDeliveryNoteInput,
    actorUserId: number | null,
  ): Promise<DeliveryNote> {
    const db = resolveDb(this.db);
    const remitoType =
      input.remito_type ?? remitoTypeForPaperKind(input.kind ?? "DELIVERY");
    const kind = paperKindForRemitoType(remitoType);

    let remitoNumber = input.remito_number?.trim() ?? "";
    let seriesId: number | null = input.series_id ?? null;

    // Operator creates omit remito_number and always allocate from series
    // under row lock (avoids collisions). Explicit remito_number remains for
    // legacy/migration callers only.
    if (!remitoNumber) {
      const allocated = await this.allocateNumber({
        seriesId: input.series_id,
        seriesCode: input.series_code ?? "A",
      });
      remitoNumber = allocated.remitoNumber;
      seriesId = allocated.seriesId;
    }

    try {
      const inserted = await db
        .insertInto("delivery_note")
        .values({
          remito_number: remitoNumber,
          series_id: seriesId,
          kind,
          remito_type: remitoType,
          status: "DRAFT",
          picking_status: "PENDING",
          priority: input.priority ?? "NORMAL",
          issued_date: input.issued_date ?? null,
          scheduled_delivery_at: input.scheduled_delivery_at ?? null,
          client_party_id: input.client_party_id ?? null,
          origin_warehouse_id: input.origin_warehouse_id ?? null,
          destination_warehouse_id: input.destination_warehouse_id ?? null,
          observations: input.observations ?? null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const remitoId = Number(inserted.id);
      await this.insertHistory({
        remitoId,
        fromStatus: null,
        toStatus: "DRAFT",
        actorUserId,
        note: "Created",
      });

      const created = await this.getById(remitoId);
      if (!created) throw ApiErrors.notFound("Delivery note not found");
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "DUPLICATE_REMITO",
          "A delivery note with this remito number already exists",
        );
      }
      throw error;
    }
  }

  async update(
    id: number,
    input: UpdateDeliveryNoteInput,
  ): Promise<DeliveryNote> {
    const db = resolveDb(this.db);
    const patch: Record<string, unknown> = {
      version: input.version + 1,
    };
    if (input.remito_type !== undefined) {
      patch.remito_type = input.remito_type;
      patch.kind = paperKindForRemitoType(input.remito_type);
    }
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.issued_date !== undefined) patch.issued_date = input.issued_date;
    if (input.scheduled_delivery_at !== undefined) {
      patch.scheduled_delivery_at = input.scheduled_delivery_at;
    }
    if (input.client_party_id !== undefined) {
      patch.client_party_id = input.client_party_id;
    }
    if (input.origin_warehouse_id !== undefined) {
      patch.origin_warehouse_id = input.origin_warehouse_id;
    }
    if (input.destination_warehouse_id !== undefined) {
      patch.destination_warehouse_id = input.destination_warehouse_id;
    }
    if (input.observations !== undefined) {
      patch.observations = input.observations;
    }

    const updated = await db
      .updateTable("delivery_note")
      .set(patch)
      .where("id", "=", id)
      .where("version", "=", input.version)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Remito version conflict");
    }

    const note = await this.getById(id);
    if (!note) throw ApiErrors.notFound("Delivery note not found");
    return note;
  }

  async setPickingStatus(
    id: number,
    pickingStatus: Extract<PickingStatus, "PREPARING" | "COMPLETE">,
    version: number,
  ): Promise<DeliveryNote> {
    const db = resolveDb(this.db);
    const updated = await db
      .updateTable("delivery_note")
      .set({
        picking_status: pickingStatus,
        version: version + 1,
      })
      .where("id", "=", id)
      .where("version", "=", version)
      .where("deleted_at", "is", null)
      .where("status", "in", ["DRAFT", "PREPARED"])
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      const current = await this.getById(id);
      if (!current) throw ApiErrors.notFound("Delivery note not found");
      if (current.version !== version) {
        throw ApiErrors.conflict("VERSION_CONFLICT", "Remito version conflict");
      }
      throw ApiErrors.validationFailed(
        "Picking status can only change while remito is DRAFT or PREPARED",
        [{ field: "status", issue: `Current status is ${current.status}` }],
      );
    }

    const note = await this.getById(id);
    if (!note) throw ApiErrors.notFound("Delivery note not found");
    return note;
  }

  async transition(input: {
    id: number;
    toStatus: RemitoStatus;
    version: number;
    actorUserId: number | null;
    note?: string | null;
    scheduledDeliveryAt?: string | null;
    cancelReason?: string | null;
    driverId?: number | null;
    helperId?: number | null;
    vehicleId?: number | null;
  }): Promise<DeliveryNote> {
    const db = resolveDb(this.db);
    const current = await this.getById(input.id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    if (current.version !== input.version) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Remito version conflict");
    }

    const patch: Record<string, unknown> = {
      status: input.toStatus,
      version: input.version + 1,
    };
    if (input.scheduledDeliveryAt !== undefined) {
      patch.scheduled_delivery_at = input.scheduledDeliveryAt;
    }
    if (input.driverId !== undefined) patch.driver_id = input.driverId;
    if (input.helperId !== undefined) patch.helper_id = input.helperId;
    if (input.vehicleId !== undefined) patch.vehicle_id = input.vehicleId;
    if (input.toStatus === "CANCELLED") {
      patch.cancel_reason = input.cancelReason?.trim() ?? null;
    }
    if (input.toStatus === "IN_TRANSIT") {
      patch.departure_at = new Date();
    }
    if (input.toStatus === "DELIVERED" && current.arrival_at == null) {
      patch.arrival_at = new Date();
    }
    if (input.toStatus === "CLOSED") {
      patch.closed_at = new Date();
    }
    if (input.toStatus === "LOADED") {
      patch.picking_status = "LOADED";
    }

    const updated = await db
      .updateTable("delivery_note")
      .set(patch)
      .where("id", "=", input.id)
      .where("version", "=", input.version)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Remito version conflict");
    }

    await this.insertHistory({
      remitoId: input.id,
      fromStatus: current.status,
      toStatus: input.toStatus,
      actorUserId: input.actorUserId,
      note: input.note ?? input.cancelReason ?? null,
    });

    const note = await this.getById(input.id);
    if (!note) throw ApiErrors.notFound("Delivery note not found");
    return note;
  }

  async countLines(remitoId: number): Promise<number> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("remito_line")
      .select(sql<string>`count(*)::int`.as("count"))
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return toCount(row?.count);
  }

  async listLines(remitoId: number): Promise<RemitoLine[]> {
    const db = resolveDb(this.db);
    const rows = (await db
      .selectFrom("remito_line")
      .select(LINE_SELECT)
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .orderBy("line_no", "asc")
      .orderBy("id", "asc")
      .execute()) as RemitoLineRow[];
    return rows.map(mapLine);
  }

  async getLine(remitoId: number, lineId: number): Promise<RemitoLine | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("remito_line")
      .select(LINE_SELECT)
      .where("id", "=", lineId)
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .executeTakeFirst()) as RemitoLineRow | undefined;
    return row ? mapLine(row) : null;
  }

  async addLine(
    remitoId: number,
    input: CreateRemitoLineInput,
  ): Promise<RemitoLine> {
    const db = resolveDb(this.db);
    const maxRow = await db
      .selectFrom("remito_line")
      .select(sql<string>`coalesce(max(line_no), 0)::int`.as("max_line_no"))
      .where("remito_id", "=", remitoId)
      .executeTakeFirst();
    const lineNo = toCount(maxRow?.max_line_no) + 1;

    const itemKind = input.item_kind ?? "CYLINDER";
    let serialNumber: string | null = null;
    let gasCode: string | null = null;
    let capacityValue: number | null = null;
    let capacityUnit: CapacityUnit | null = null;
    let ownerPartyId: number | null = null;
    let ownershipBasis: OwnershipBasis | null = null;
    let condition: CylinderCondition | null = null;
    let isRental = input.is_rental ?? false;

    if (itemKind === "CYLINDER" && input.cylinder_id != null) {
      const cylinder = await db
        .selectFrom("cylinder")
        .select([
          "serial_number",
          "gas_code",
          "capacity_m3",
          "capacity_unit",
          "owner_party_id",
          "ownership_basis",
          "condition",
        ])
        .where("id", "=", input.cylinder_id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!cylinder) throw ApiErrors.notFound("Cylinder not found");

      serialNumber = cylinder.serial_number;
      gasCode = cylinder.gas_code;
      capacityValue = toNumber(cylinder.capacity_m3);
      capacityUnit = cylinder.capacity_unit;
      ownerPartyId = Number(cylinder.owner_party_id);
      ownershipBasis = cylinder.ownership_basis;
      condition = cylinder.condition;
      if (input.is_rental === undefined) {
        isRental = ownershipBasis === "OURS" || ownershipBasis === "SUPPLIER";
      }
    }

    const inserted = await db
      .insertInto("remito_line")
      .values({
        remito_id: remitoId,
        line_no: lineNo,
        item_kind: itemKind,
        cylinder_id: input.cylinder_id ?? null,
        battery_id: input.battery_id ?? null,
        accessory_id: input.accessory_id ?? null,
        serial_number: serialNumber,
        gas_code: gasCode,
        capacity_value: capacityValue,
        capacity_unit: capacityUnit,
        owner_party_id: ownerPartyId,
        is_rental: isRental,
        ownership_basis: ownershipBasis,
        qty: input.qty ?? 1,
        picked_qty: 0,
        condition,
        notes: input.notes ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const line = await this.getLine(remitoId, Number(inserted.id));
    if (!line) throw ApiErrors.notFound("Remito line not found");
    return line;
  }

  async updateLine(
    remitoId: number,
    lineId: number,
    input: UpdateRemitoLineInput,
  ): Promise<RemitoLine> {
    const db = resolveDb(this.db);
    const patch: Record<string, unknown> = {};
    if (input.qty !== undefined) patch.qty = input.qty;
    if (input.picked_qty !== undefined) patch.picked_qty = input.picked_qty;
    if (input.delivered_qty !== undefined) {
      patch.delivered_qty = input.delivered_qty;
    }
    if (input.returned_qty !== undefined) {
      patch.returned_qty = input.returned_qty;
    }
    if (input.is_rental !== undefined) patch.is_rental = input.is_rental;
    if (input.pressure !== undefined) patch.pressure = input.pressure;
    if (input.condition !== undefined) patch.condition = input.condition;
    if (input.notes !== undefined) patch.notes = input.notes;

    if (Object.keys(patch).length === 0) {
      const existing = await this.getLine(remitoId, lineId);
      if (!existing) throw ApiErrors.notFound("Remito line not found");
      return existing;
    }

    const updated = await db
      .updateTable("remito_line")
      .set(patch)
      .where("id", "=", lineId)
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.notFound("Remito line not found");
    }

    const line = await this.getLine(remitoId, lineId);
    if (!line) throw ApiErrors.notFound("Remito line not found");
    return line;
  }

  async softDeleteLine(remitoId: number, lineId: number): Promise<void> {
    const db = resolveDb(this.db);
    const updated = await db
      .updateTable("remito_line")
      .set({ deleted_at: new Date() })
      .where("id", "=", lineId)
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.notFound("Remito line not found");
    }
  }

  async softDelete(id: number): Promise<void> {
    const db = resolveDb(this.db);
    const updated = await db
      .updateTable("delivery_note")
      .set({ deleted_at: new Date() })
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.notFound("Delivery note not found");
    }
  }

  async linkLineMovement(
    remitoId: number,
    lineId: number,
    movementEventId: number,
  ): Promise<void> {
    const db = resolveDb(this.db);
    const updated = await db
      .updateTable("remito_line")
      .set({ movement_event_id: movementEventId })
      .where("id", "=", lineId)
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.notFound("Remito line not found");
    }
  }

  async linkLineAccessoryRental(
    remitoId: number,
    lineId: number,
    accessoryRentalId: number,
  ): Promise<void> {
    const db = resolveDb(this.db);
    const updated = await db
      .updateTable("remito_line")
      .set({ accessory_rental_id: accessoryRentalId })
      .where("id", "=", lineId)
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.notFound("Remito line not found");
    }
  }

  async listIncidents(remitoId: number): Promise<RemitoIncident[]> {
    const db = resolveDb(this.db);
    const rows = (await db
      .selectFrom("remito_incident")
      .select([
        "id",
        "remito_id",
        "line_id",
        "type",
        "severity",
        "status",
        "description",
        "reported_by",
        "reported_at",
        "resolution",
        "resolved_by",
        "resolved_at",
      ])
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .orderBy("reported_at", "desc")
      .orderBy("id", "desc")
      .execute()) as RemitoIncidentRow[];
    return rows.map(mapIncident);
  }

  async getIncident(
    remitoId: number,
    incidentId: number,
  ): Promise<RemitoIncident | null> {
    const db = resolveDb(this.db);
    const row = (await db
      .selectFrom("remito_incident")
      .select([
        "id",
        "remito_id",
        "line_id",
        "type",
        "severity",
        "status",
        "description",
        "reported_by",
        "reported_at",
        "resolution",
        "resolved_by",
        "resolved_at",
      ])
      .where("id", "=", incidentId)
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .executeTakeFirst()) as RemitoIncidentRow | undefined;
    return row ? mapIncident(row) : null;
  }

  async addIncident(
    remitoId: number,
    input: CreateRemitoIncidentInput,
    reportedBy: number | null,
  ): Promise<RemitoIncident> {
    const db = resolveDb(this.db);
    if (input.line_id != null) {
      const line = await this.getLine(remitoId, input.line_id);
      if (!line) throw ApiErrors.notFound("Remito line not found");
    }

    const inserted = await db
      .insertInto("remito_incident")
      .values({
        remito_id: remitoId,
        line_id: input.line_id ?? null,
        type: input.type,
        severity: input.severity ?? "MEDIUM",
        status: "OPEN",
        description: input.description,
        reported_by: reportedBy,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const incident = await this.getIncident(remitoId, Number(inserted.id));
    if (!incident) throw ApiErrors.notFound("Remito incident not found");
    return incident;
  }

  async updateIncident(
    remitoId: number,
    incidentId: number,
    input: UpdateRemitoIncidentInput,
    actorUserId: number | null,
  ): Promise<RemitoIncident> {
    const db = resolveDb(this.db);
    const current = await this.getIncident(remitoId, incidentId);
    if (!current) throw ApiErrors.notFound("Remito incident not found");

    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) patch.status = input.status;
    if (input.severity !== undefined) patch.severity = input.severity;
    if (input.resolution !== undefined) patch.resolution = input.resolution;
    if (input.description !== undefined) patch.description = input.description;

    const nextStatus = input.status ?? current.status;
    if (
      (nextStatus === "RESOLVED" || nextStatus === "DISMISSED") &&
      current.resolved_at == null
    ) {
      patch.resolved_at = new Date();
      patch.resolved_by = actorUserId;
    }

    if (Object.keys(patch).length === 0) return current;

    const updated = await db
      .updateTable("remito_incident")
      .set(patch)
      .where("id", "=", incidentId)
      .where("remito_id", "=", remitoId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.notFound("Remito incident not found");
    }

    const incident = await this.getIncident(remitoId, incidentId);
    if (!incident) throw ApiErrors.notFound("Remito incident not found");
    return incident;
  }

  async getClientFiscal(partyId: number): Promise<{
    name: string | null;
    cuit: string | null;
    address: string | null;
  } | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("client")
      .innerJoin("party", "party.id", "client.party_id")
      .select([
        "party.display_name as name",
        "client.cuit",
        "client.address_street as address",
      ])
      .where("client.party_id", "=", partyId)
      .where("client.deleted_at", "is", null)
      .executeTakeFirst();
    if (!row) return null;
    return {
      name: row.name ?? null,
      cuit: row.cuit ?? null,
      address: row.address ?? null,
    };
  }

  async nextReprintSeq(remitoId: number): Promise<number> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("remito_print_log")
      .select(sql<string>`coalesce(max(reprint_seq), 0)::int`.as("max_seq"))
      .where("remito_id", "=", remitoId)
      .where("copy_kind", "=", "REIMPRESION")
      .executeTakeFirst();
    return toCount(row?.max_seq) + 1;
  }

  async logPrint(input: {
    remitoId: number;
    copyKind: PrintCopyKind;
    reprintSeq: number | null;
    reason: string | null;
    printedBy: number | null;
    contentVersion: number | null;
  }): Promise<RemitoPrintLog> {
    const db = resolveDb(this.db);
    const inserted = await db
      .insertInto("remito_print_log")
      .values({
        remito_id: input.remitoId,
        copy_kind: input.copyKind,
        reprint_seq: input.reprintSeq,
        reason: input.reason,
        printed_by: input.printedBy,
        content_version: input.contentVersion,
        pdf_object_ref: null,
      })
      .returning([
        "id",
        "remito_id",
        "copy_kind",
        "reprint_seq",
        "reason",
        "printed_by",
        "printed_at",
        "pdf_object_ref",
        "content_version",
      ])
      .executeTakeFirstOrThrow();

    return {
      id: Number(inserted.id),
      remito_id: Number(inserted.remito_id),
      copy_kind: inserted.copy_kind,
      reprint_seq:
        inserted.reprint_seq == null ? null : Number(inserted.reprint_seq),
      reason: inserted.reason,
      printed_by:
        inserted.printed_by == null ? null : Number(inserted.printed_by),
      printed_at:
        inserted.printed_at instanceof Date
          ? inserted.printed_at.toISOString()
          : String(inserted.printed_at),
      pdf_object_ref: inserted.pdf_object_ref,
      content_version:
        inserted.content_version == null
          ? null
          : Number(inserted.content_version),
    };
  }

  async listWarehouses(query: WarehouseListQuery): Promise<{
    data: Warehouse[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    let qb = db
      .selectFrom("warehouse")
      .select(["id", "code", "name", "territory_id", "address", "is_active"])
      .where("deleted_at", "is", null)
      .where("is_active", "=", true)
      .orderBy("name", "asc")
      .orderBy("id", "asc");

    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([eb("code", "ilike", term), eb("name", "ilike", term)]),
      );
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
        code: row.code,
        name: row.name,
        territory_id:
          row.territory_id == null ? null : Number(row.territory_id),
        address: row.address,
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

  async listVehicles(query: VehicleListQuery): Promise<{
    data: Vehicle[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    let qb = db
      .selectFrom("vehicle")
      .select([
        "id",
        "plate",
        "name",
        "capacity_units",
        "capacity_weight",
        "is_active",
      ])
      .where("deleted_at", "is", null)
      .where("is_active", "=", true)
      .orderBy("plate", "asc")
      .orderBy("id", "asc");

    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([eb("plate", "ilike", term), eb("name", "ilike", term)]),
      );
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorPlate = String(cursor.plate ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb = qb.where((eb) =>
        eb.or([
          eb("plate", ">", cursorPlate),
          eb.and([eb("plate", "=", cursorPlate), eb("id", ">", cursorId)]),
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
        plate: String(row.plate),
        name: row.name,
        capacity_units:
          row.capacity_units == null ? null : Number(row.capacity_units),
        capacity_weight: toNumber(row.capacity_weight),
        is_active: row.is_active,
      })),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ plate: String(last.plate), id: Number(last.id) })
            : null,
      }),
    };
  }

  async createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    const db = resolveDb(this.db);
    try {
      const row = await db
        .insertInto("vehicle")
        .values({
          plate: input.plate,
          name: input.name ?? null,
          capacity_units: input.capacity_units ?? null,
          capacity_weight: input.capacity_weight ?? null,
          is_active: true,
        })
        .returning([
          "id",
          "plate",
          "name",
          "capacity_units",
          "capacity_weight",
          "is_active",
        ])
        .executeTakeFirstOrThrow();
      return {
        id: Number(row.id),
        plate: String(row.plate),
        name: row.name,
        capacity_units:
          row.capacity_units == null ? null : Number(row.capacity_units),
        capacity_weight: toNumber(row.capacity_weight),
        is_active: row.is_active,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "DUPLICATE_VEHICLE",
          "A vehicle with this plate already exists",
        );
      }
      throw error;
    }
  }

  async listDrivers(query: DriverListQuery): Promise<{
    data: DriverProfile[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    let qb = db
      .selectFrom("driver_profile")
      .select([
        "id",
        "user_id",
        "display_name",
        "phone",
        "license_no",
        "license_expiry",
        "default_vehicle_id",
        "is_helper_eligible",
        "is_active",
      ])
      .where("deleted_at", "is", null)
      .where("is_active", "=", true)
      .orderBy("display_name", "asc")
      .orderBy("id", "asc");

    if (query.helpers_only) {
      qb = qb.where("is_helper_eligible", "=", true);
    }
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where("display_name", "ilike", term);
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorName = String(cursor.display_name ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb = qb.where((eb) =>
        eb.or([
          eb("display_name", ">", cursorName),
          eb.and([
            eb("display_name", "=", cursorName),
            eb("id", ">", cursorId),
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
        user_id: row.user_id == null ? null : Number(row.user_id),
        display_name: row.display_name,
        phone: row.phone,
        license_no: row.license_no,
        license_expiry: isoDate(row.license_expiry),
        default_vehicle_id:
          row.default_vehicle_id == null
            ? null
            : Number(row.default_vehicle_id),
        is_helper_eligible: row.is_helper_eligible,
        is_active: row.is_active,
      })),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                display_name: last.display_name,
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async createDriver(input: CreateDriverProfileInput): Promise<DriverProfile> {
    const db = resolveDb(this.db);
    try {
      const row = await db
        .insertInto("driver_profile")
        .values({
          display_name: input.display_name,
          user_id: input.user_id ?? null,
          phone: input.phone ?? null,
          license_no: input.license_no ?? null,
          license_expiry: input.license_expiry ?? null,
          default_vehicle_id: input.default_vehicle_id ?? null,
          is_helper_eligible: input.is_helper_eligible ?? true,
          is_active: true,
        })
        .returning([
          "id",
          "user_id",
          "display_name",
          "phone",
          "license_no",
          "license_expiry",
          "default_vehicle_id",
          "is_helper_eligible",
          "is_active",
        ])
        .executeTakeFirstOrThrow();
      return {
        id: Number(row.id),
        user_id: row.user_id == null ? null : Number(row.user_id),
        display_name: row.display_name,
        phone: row.phone,
        license_no: row.license_no,
        license_expiry: isoDate(row.license_expiry),
        default_vehicle_id:
          row.default_vehicle_id == null
            ? null
            : Number(row.default_vehicle_id),
        is_helper_eligible: row.is_helper_eligible,
        is_active: row.is_active,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "DUPLICATE_DRIVER",
          "A driver profile for this user already exists",
        );
      }
      throw error;
    }
  }

  async listRemitoSeries(query: {
    limit: number;
    cursor?: string;
    q?: string;
  }): Promise<{
    data: RemitoSeries[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    let qb = db
      .selectFrom("remito_series")
      .select([
        "id",
        "code",
        "emission_point_label",
        "pad_width",
        "next_number",
        "is_active",
      ])
      .where("is_active", "=", true)
      .orderBy("code", "asc")
      .orderBy("id", "asc");

    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([
          eb("code", "ilike", term),
          eb("emission_point_label", "ilike", term),
        ]),
      );
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorCode = String(cursor.code ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb = qb.where((eb) =>
        eb.or([
          eb("code", ">", cursorCode),
          eb.and([eb("code", "=", cursorCode), eb("id", ">", cursorId)]),
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
        code: row.code,
        emission_point_label: row.emission_point_label,
        pad_width: Number(row.pad_width),
        next_number: Number(row.next_number),
        is_active: row.is_active,
      })),
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({ code: last.code, id: Number(last.id) })
            : null,
      }),
    };
  }

  private async listLinkedMovements(
    remitoId: number,
  ): Promise<DeliveryNoteLinkedMovement[]> {
    const db = resolveDb(this.db);
    const movements = (await db
      .selectFrom("movement_event")
      .innerJoin("cylinder", "cylinder.id", "movement_event.cylinder_id")
      .innerJoin("party", "party.id", "movement_event.holder_party_id")
      .select([
        "movement_event.id",
        "movement_event.cylinder_id",
        "cylinder.serial_number as cylinder_serial",
        "cylinder.gas_code",
        "cylinder.capacity_m3",
        "cylinder.capacity_unit",
        "cylinder.condition",
        "movement_event.holder_party_id",
        "party.display_name as holder_name",
        "movement_event.movement_kind",
        "movement_event.delivery_date",
        "movement_event.return_date",
        "movement_event.state",
      ])
      .where("movement_event.remito_id", "=", remitoId)
      .orderBy("movement_event.delivery_date", "desc")
      .orderBy("movement_event.id", "desc")
      .limit(100)
      .execute()) as LinkedMovementRow[];
    return movements.map(mapLinkedMovement);
  }

  private async listLinkedRentals(
    remitoId: number,
  ): Promise<DeliveryNoteLinkedRental[]> {
    const db = resolveDb(this.db);
    const rentals = (await db
      .selectFrom("accessory_rental")
      .innerJoin("accessory", "accessory.id", "accessory_rental.accessory_id")
      .innerJoin("party", "party.id", "accessory_rental.client_party_id")
      .select([
        "accessory_rental.id",
        "accessory_rental.accessory_id",
        "accessory.accessory_type",
        "accessory.identifier as accessory_identifier",
        "accessory_rental.client_party_id",
        "party.display_name as client_name",
        "accessory_rental.start_date",
        "accessory_rental.end_date",
        "accessory_rental.charge_basis",
        "accessory_rental.state",
      ])
      .where("accessory_rental.remito_id", "=", remitoId)
      .orderBy("accessory_rental.start_date", "desc")
      .orderBy("accessory_rental.id", "desc")
      .limit(100)
      .execute()) as LinkedRentalRow[];
    return rentals.map(mapLinkedRental);
  }

  private async listStatusHistory(
    remitoId: number,
  ): Promise<RemitoStatusHistoryEntry[]> {
    const db = resolveDb(this.db);
    const history = (await db
      .selectFrom("remito_status_history")
      .select(["id", "from_status", "to_status", "actor_user_id", "note", "at"])
      .where("remito_id", "=", remitoId)
      .orderBy("at", "desc")
      .orderBy("id", "desc")
      .limit(50)
      .execute()) as StatusHistoryRow[];
    return history.map(mapHistory);
  }

  private async insertHistory(input: {
    remitoId: number;
    fromStatus: RemitoStatus | null;
    toStatus: RemitoStatus;
    actorUserId: number | null;
    note: string | null;
  }): Promise<void> {
    const db = resolveDb(this.db);
    await db
      .insertInto("remito_status_history")
      .values({
        remito_id: input.remitoId,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        actor_user_id: input.actorUserId,
        note: input.note,
      })
      .execute();
  }
}

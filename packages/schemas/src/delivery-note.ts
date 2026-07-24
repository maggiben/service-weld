import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import {
  AccessoryRentalState,
  AccessoryType,
  CapacityUnit,
  ChargeBasis,
  CylinderCondition,
  DeliveryNoteKind,
  GasCode,
  MovementKind,
  MovementState,
  PickingStatus,
  RemitoPriority,
  RemitoStatus,
  RemitoType,
} from "./enums";
import { RemitoIncident, RemitoLine } from "./remito-ops";

/** Delivery note (remito) — operational Aggregate Root (docs/specs/remitos.md). */
export const DeliveryNote = zod.object({
  id: zod.number().int(),
  remito_number: zod.string().min(1),
  series_id: zod.number().int().nullable().optional(),
  series_code: zod.string().nullable().optional(),
  kind: DeliveryNoteKind,
  remito_type: RemitoType,
  status: RemitoStatus,
  picking_status: PickingStatus,
  priority: RemitoPriority,
  issued_date: IsoDate.nullable(),
  scheduled_delivery_at: zod.string().datetime().nullable().optional(),
  departure_at: zod.string().datetime().nullable().optional(),
  arrival_at: zod.string().datetime().nullable().optional(),
  closed_at: zod.string().datetime().nullable().optional(),
  client_party_id: zod.number().int().nullable(),
  client_name: zod.string().nullable().optional(),
  origin_warehouse_id: zod.number().int().nullable().optional(),
  origin_warehouse_name: zod.string().nullable().optional(),
  destination_warehouse_id: zod.number().int().nullable().optional(),
  driver_id: zod.number().int().nullable().optional(),
  driver_name: zod.string().nullable().optional(),
  helper_id: zod.number().int().nullable().optional(),
  helper_name: zod.string().nullable().optional(),
  vehicle_id: zod.number().int().nullable().optional(),
  vehicle_plate: zod.string().nullable().optional(),
  observations: zod.string().nullable().optional(),
  cancel_reason: zod.string().nullable().optional(),
  version: zod.number().int().nonnegative().optional(),
  created_at: zod.string().datetime().optional(),
  updated_at: zod.string().datetime().optional(),
  line_count: zod.number().int().nonnegative().optional(),
  /** Linked cylinder movements (list/detail). */
  movement_count: zod.number().int().nonnegative().optional(),
  /** Linked accessory rentals (list/detail). */
  accessory_rental_count: zod.number().int().nonnegative().optional(),
});
export type DeliveryNote = zod.infer<typeof DeliveryNote>;

export const RemitoStatusHistoryEntry = zod.object({
  id: zod.number().int(),
  from_status: RemitoStatus.nullable(),
  to_status: RemitoStatus,
  actor_user_id: zod.number().int().nullable(),
  note: zod.string().nullable(),
  at: zod.string().datetime(),
});
export type RemitoStatusHistoryEntry = zod.infer<
  typeof RemitoStatusHistoryEntry
>;

export const DeliveryNoteLinkedMovement = zod.object({
  id: zod.number().int(),
  cylinder_id: zod.number().int(),
  cylinder_serial: zod.string().optional(),
  gas_code: GasCode.nullable().optional(),
  capacity_m3: zod.number().nullable().optional(),
  capacity_unit: CapacityUnit.optional(),
  condition: CylinderCondition.nullable().optional(),
  holder_party_id: zod.number().int(),
  holder_name: zod.string().optional(),
  movement_kind: MovementKind,
  delivery_date: IsoDate,
  return_date: IsoDate.nullable(),
  state: MovementState,
});
export type DeliveryNoteLinkedMovement = zod.infer<
  typeof DeliveryNoteLinkedMovement
>;

export const DeliveryNoteLinkedRental = zod.object({
  id: zod.number().int(),
  accessory_id: zod.number().int(),
  accessory_type: AccessoryType.optional(),
  accessory_identifier: zod.string().nullable().optional(),
  client_party_id: zod.number().int(),
  client_name: zod.string().optional(),
  start_date: IsoDate,
  end_date: IsoDate.nullable(),
  charge_basis: ChargeBasis,
  state: AccessoryRentalState,
});
export type DeliveryNoteLinkedRental = zod.infer<
  typeof DeliveryNoteLinkedRental
>;

export const DeliveryNoteDetail = DeliveryNote.extend({
  lines: zod.array(RemitoLine).optional(),
  incidents: zod.array(RemitoIncident).optional(),
  movements: zod.array(DeliveryNoteLinkedMovement),
  accessory_rentals: zod.array(DeliveryNoteLinkedRental),
  status_history: zod.array(RemitoStatusHistoryEntry).optional(),
});
export type DeliveryNoteDetail = zod.infer<typeof DeliveryNoteDetail>;

export const CreateDeliveryNoteInput = zod.object({
  /** Omit to allocate next number from series (default series A). */
  remito_number: zod.string().trim().min(1).max(64).optional(),
  series_id: zod.number().int().optional(),
  series_code: zod.string().trim().min(1).max(8).optional(),
  kind: DeliveryNoteKind.optional(),
  remito_type: RemitoType.optional(),
  priority: RemitoPriority.default("NORMAL"),
  issued_date: IsoDate.nullable().optional(),
  scheduled_delivery_at: zod.string().datetime().nullable().optional(),
  client_party_id: zod.number().int().nullable().optional(),
  origin_warehouse_id: zod.number().int().nullable().optional(),
  destination_warehouse_id: zod.number().int().nullable().optional(),
  observations: zod.string().trim().max(4000).nullable().optional(),
});
export type CreateDeliveryNoteInput = zod.infer<typeof CreateDeliveryNoteInput>;

export const UpdateDeliveryNoteInput = zod.object({
  version: zod.number().int().nonnegative(),
  remito_type: RemitoType.optional(),
  priority: RemitoPriority.optional(),
  issued_date: IsoDate.nullable().optional(),
  scheduled_delivery_at: zod.string().datetime().nullable().optional(),
  client_party_id: zod.number().int().nullable().optional(),
  origin_warehouse_id: zod.number().int().nullable().optional(),
  destination_warehouse_id: zod.number().int().nullable().optional(),
  observations: zod.string().trim().max(4000).nullable().optional(),
});
export type UpdateDeliveryNoteInput = zod.infer<typeof UpdateDeliveryNoteInput>;

export const RemitoTransitionInput = zod.object({
  version: zod.number().int().nonnegative(),
  note: zod.string().trim().max(2000).nullable().optional(),
  scheduled_delivery_at: zod.string().datetime().nullable().optional(),
  cancel_reason: zod.string().trim().min(1).max(2000).optional(),
  driver_id: zod.number().int().nullable().optional(),
  helper_id: zod.number().int().nullable().optional(),
  vehicle_id: zod.number().int().nullable().optional(),
});
export type RemitoTransitionInput = zod.infer<typeof RemitoTransitionInput>;

export const DeliveryNoteListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
  sort: zod
    .enum(["issued_date", "-issued_date", "remito_number", "-remito_number"])
    .default("-issued_date"),
  "filter[client_party_id]": zod.coerce.number().int().optional(),
  "filter[kind]": DeliveryNoteKind.optional(),
  "filter[remito_type]": RemitoType.optional(),
  "filter[status]": RemitoStatus.optional(),
  "filter[priority]": RemitoPriority.optional(),
  "filter[picking_status]": PickingStatus.optional(),
});
export type DeliveryNoteListQuery = zod.infer<typeof DeliveryNoteListQuery>;

export const DeliveryNoteListResponse = paginated(DeliveryNote);
export type DeliveryNoteListResponse = zod.infer<
  typeof DeliveryNoteListResponse
>;

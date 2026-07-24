import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import {
  AccessoryRentalState,
  AccessoryType,
  ChargeBasis,
  DeliveryNoteKind,
  MovementKind,
  MovementState,
} from "./enums";

/** Delivery note (remito) — external paper reference (domain E14). */
export const DeliveryNote = zod.object({
  id: zod.number().int(),
  remito_number: zod.string().min(1),
  kind: DeliveryNoteKind,
  issued_date: IsoDate.nullable(),
  client_party_id: zod.number().int().nullable(),
  client_name: zod.string().nullable().optional(),
  /** Linked cylinder movements (list/detail). */
  movement_count: zod.number().int().nonnegative().optional(),
  /** Linked accessory rentals (list/detail). */
  accessory_rental_count: zod.number().int().nonnegative().optional(),
});
export type DeliveryNote = zod.infer<typeof DeliveryNote>;

export const DeliveryNoteLinkedMovement = zod.object({
  id: zod.number().int(),
  cylinder_id: zod.number().int(),
  cylinder_serial: zod.string().optional(),
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
  movements: zod.array(DeliveryNoteLinkedMovement),
  accessory_rentals: zod.array(DeliveryNoteLinkedRental),
});
export type DeliveryNoteDetail = zod.infer<typeof DeliveryNoteDetail>;

export const CreateDeliveryNoteInput = zod.object({
  remito_number: zod.string().trim().min(1).max(64),
  kind: DeliveryNoteKind.default("DELIVERY"),
  issued_date: IsoDate.nullable().optional(),
  client_party_id: zod.number().int().nullable().optional(),
});
export type CreateDeliveryNoteInput = zod.infer<typeof CreateDeliveryNoteInput>;

export const DeliveryNoteListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
  sort: zod
    .enum(["issued_date", "-issued_date", "remito_number", "-remito_number"])
    .default("-issued_date"),
  "filter[client_party_id]": zod.coerce.number().int().optional(),
  "filter[kind]": DeliveryNoteKind.optional(),
});
export type DeliveryNoteListQuery = zod.infer<typeof DeliveryNoteListQuery>;

export const DeliveryNoteListResponse = paginated(DeliveryNote);
export type DeliveryNoteListResponse = zod.infer<
  typeof DeliveryNoteListResponse
>;

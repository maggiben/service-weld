import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import {
  CapacityUnit,
  GasCode,
  MovementKind,
  MovementState,
  OwnershipBasis,
} from "./enums";

export const MovementEvent = zod.object({
  id: zod.number().int(),
  request_id: zod.string().uuid(),
  cylinder_id: zod.number().int(),
  holder_party_id: zod.number().int(),
  holder_name: zod.string().optional(),
  movement_kind: MovementKind,
  property_basis: OwnershipBasis,
  gas_code: GasCode.nullable(),
  delivery_date: IsoDate,
  return_date: IsoDate.nullable(),
  rental_days: zod.number().int().nullable(),
  origin_party_id: zod.number().int().nullable(),
  swap_with_cyl_id: zod.number().int().nullable(),
  remito_id: zod.number().int().nullable(),
  /** Denormalized from delivery_note when remito_id is set. */
  remito_number: zod.string().nullable().optional(),
  state: MovementState,
  note: zod.string().nullable(),
  version: zod.number().int(),
  created_at: zod.string().datetime(),
  cylinder_serial: zod.string().optional(),
  /** Denormalized from cylinder for grids (refills / movements). */
  capacity_m3: zod.number().nullable().optional(),
  capacity_unit: CapacityUnit.optional(),
  locality_name: zod.string().nullable().optional(),
  owner_party_id: zod.number().int().nullable().optional(),
  owner_name: zod.string().nullable().optional(),
});
export type MovementEvent = zod.infer<typeof MovementEvent>;

export const CreateMovementInput = zod.object({
  cylinder_id: zod.number().int(),
  holder_party_id: zod.number().int(),
  movement_kind: MovementKind,
  gas_code: GasCode.nullable().optional(),
  delivery_date: IsoDate,
  origin_party_id: zod.number().int().nullable().optional(),
  /** Prefer when remito Aggregate already exists (close side effects). */
  remito_id: zod.number().int().nullable().optional(),
  remito_number: zod.string().nullable().optional(),
  note: zod.string().nullable().optional(),
  request_id: zod.string().uuid().optional(),
});
export type CreateMovementInput = zod.infer<typeof CreateMovementInput>;

export const ReturnMovementInput = zod.object({
  return_date: IsoDate,
});
export type ReturnMovementInput = zod.infer<typeof ReturnMovementInput>;

export const SwapMovementInput = zod.object({
  returned_cylinder_id: zod.number().int(),
  return_date: IsoDate,
});
export type SwapMovementInput = zod.infer<typeof SwapMovementInput>;

export const VoidMovementInput = zod.object({
  reason: zod.string().min(1),
});
export type VoidMovementInput = zod.infer<typeof VoidMovementInput>;

export const MovementListQuery = PaginationQuery.extend({
  /** Partial match on cylinder serial or holder (client) display name. */
  q: zod.string().optional(),
  sort: zod
    .enum([
      "delivery_date",
      "-delivery_date",
      "return_date",
      "-return_date",
      "cylinder_serial",
      "-cylinder_serial",
      "holder_name",
      "-holder_name",
      "property_basis",
      "-property_basis",
      "movement_kind",
      "-movement_kind",
      "gas_code",
      "-gas_code",
      "rental_days",
      "-rental_days",
      "state",
      "-state",
      "capacity_m3",
      "-capacity_m3",
      "locality_name",
      "-locality_name",
      "owner_name",
      "-owner_name",
    ])
    .default("-delivery_date"),
  open: zod
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  "filter[cylinder_id]": zod.coerce.number().int().optional(),
  "filter[holder_party_id]": zod.coerce.number().int().optional(),
  /** Holder client's locality (ignored when filter[holder_party_id] is set). */
  "filter[locality_id]": zod.coerce.number().int().optional(),
  "filter[state]": MovementState.optional(),
  "filter[movement_kind]": MovementKind.optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[remito_id]": zod.coerce.number().int().optional(),
});
export type MovementListQuery = zod.infer<typeof MovementListQuery>;

export const MovementListResponse = paginated(MovementEvent);
export type MovementListResponse = zod.infer<typeof MovementListResponse>;

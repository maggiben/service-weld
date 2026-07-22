import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { GasCode, MovementKind, MovementState, OwnershipBasis } from "./enums";

export const MovementEvent = z.object({
  id: z.number().int(),
  request_id: z.string().uuid(),
  cylinder_id: z.number().int(),
  holder_party_id: z.number().int(),
  holder_name: z.string().optional(),
  movement_kind: MovementKind,
  property_basis: OwnershipBasis,
  gas_code: GasCode.nullable(),
  delivery_date: IsoDate,
  return_date: IsoDate.nullable(),
  rental_days: z.number().int().nullable(),
  origin_party_id: z.number().int().nullable(),
  swap_with_cyl_id: z.number().int().nullable(),
  remito_id: z.number().int().nullable(),
  state: MovementState,
  note: z.string().nullable(),
  version: z.number().int(),
  created_at: z.string().datetime(),
  cylinder_serial: z.string().optional(),
});
export type MovementEvent = z.infer<typeof MovementEvent>;

export const CreateMovementInput = z.object({
  cylinder_id: z.number().int(),
  holder_party_id: z.number().int(),
  movement_kind: MovementKind,
  gas_code: GasCode.nullable().optional(),
  delivery_date: IsoDate,
  origin_party_id: z.number().int().nullable().optional(),
  remito_number: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  request_id: z.string().uuid().optional(),
});
export type CreateMovementInput = z.infer<typeof CreateMovementInput>;

export const ReturnMovementInput = z.object({
  return_date: IsoDate,
});
export type ReturnMovementInput = z.infer<typeof ReturnMovementInput>;

export const SwapMovementInput = z.object({
  returned_cylinder_id: z.number().int(),
  return_date: IsoDate,
});
export type SwapMovementInput = z.infer<typeof SwapMovementInput>;

export const VoidMovementInput = z.object({
  reason: z.string().min(1),
});
export type VoidMovementInput = z.infer<typeof VoidMovementInput>;

export const MovementListQuery = PaginationQuery.extend({
  sort: z
    .enum(["delivery_date", "-delivery_date", "rental_days", "-rental_days"])
    .default("-delivery_date"),
  open: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  "filter[cylinder_id]": z.coerce.number().int().optional(),
  "filter[holder_party_id]": z.coerce.number().int().optional(),
  /** Holder client's locality (ignored when filter[holder_party_id] is set). */
  "filter[locality_id]": z.coerce.number().int().optional(),
  "filter[state]": MovementState.optional(),
  "filter[movement_kind]": MovementKind.optional(),
  "filter[gas_code]": GasCode.optional(),
});
export type MovementListQuery = z.infer<typeof MovementListQuery>;

export const MovementListResponse = paginated(MovementEvent);
export type MovementListResponse = z.infer<typeof MovementListResponse>;

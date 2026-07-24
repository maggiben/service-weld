import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import {
  AccessoryRentalState,
  AccessoryState,
  AccessoryType,
  ChargeBasis,
} from "./enums";

export const Accessory = zod.object({
  id: zod.number().int(),
  accessory_type: AccessoryType,
  identifier: zod.string().nullable(),
  owner_party_id: zod.number().int(),
  owner_name: zod.string().optional(),
  state: AccessoryState,
  version: zod.number().int(),
  created_at: zod.string().datetime(),
  updated_at: zod.string().datetime(),
});
export type Accessory = zod.infer<typeof Accessory>;

export const CreateAccessoryInput = zod.object({
  accessory_type: AccessoryType,
  identifier: zod.string().min(1).nullable().optional(),
  owner_party_id: zod.number().int(),
});
export type CreateAccessoryInput = zod.infer<typeof CreateAccessoryInput>;

export const UpdateAccessoryInput = zod.object({
  identifier: zod.string().min(1).nullable().optional(),
  state: AccessoryState.optional(),
});
export type UpdateAccessoryInput = zod.infer<typeof UpdateAccessoryInput>;

export const AccessoryListQuery = PaginationQuery.extend({
  sort: zod.enum(["updated_at", "-updated_at"]).default("-updated_at"),
  "filter[accessory_type]": AccessoryType.optional(),
  "filter[state]": AccessoryState.optional(),
});
export type AccessoryListQuery = zod.infer<typeof AccessoryListQuery>;

export const AccessoryListResponse = paginated(Accessory);
export type AccessoryListResponse = zod.infer<typeof AccessoryListResponse>;

export const AccessoryRental = zod.object({
  id: zod.number().int(),
  accessory_id: zod.number().int(),
  accessory_type: AccessoryType.optional(),
  accessory_identifier: zod.string().nullable().optional(),
  client_party_id: zod.number().int(),
  client_name: zod.string().optional(),
  quantity: zod.number().int(),
  start_date: IsoDate,
  end_date: IsoDate.nullable(),
  charge_basis: ChargeBasis,
  remito_id: zod.number().int().nullable(),
  state: AccessoryRentalState,
  version: zod.number().int(),
  created_at: zod.string().datetime().optional(),
  updated_at: zod.string().datetime().optional(),
});
export type AccessoryRental = zod.infer<typeof AccessoryRental>;

export const CreateAccessoryRentalInput = zod.object({
  accessory_id: zod.number().int(),
  client_party_id: zod.number().int(),
  quantity: zod.number().int().min(1).default(1),
  start_date: IsoDate,
  charge_basis: ChargeBasis.default("RENTAL"),
  remito_number: zod.string().nullable().optional(),
  note: zod.string().nullable().optional(),
});
export type CreateAccessoryRentalInput = zod.infer<
  typeof CreateAccessoryRentalInput
>;

export const ReturnAccessoryRentalInput = zod.object({
  end_date: IsoDate,
});
export type ReturnAccessoryRentalInput = zod.infer<
  typeof ReturnAccessoryRentalInput
>;

export const AccessoryRentalListQuery = PaginationQuery.extend({
  sort: zod.enum(["start_date", "-start_date"]).default("-start_date"),
  open: zod
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  "filter[client_party_id]": zod.coerce.number().int().optional(),
  "filter[state]": AccessoryRentalState.optional(),
  "filter[accessory_type]": AccessoryType.optional(),
  "filter[remito_id]": zod.coerce.number().int().optional(),
});
export type AccessoryRentalListQuery = zod.infer<
  typeof AccessoryRentalListQuery
>;

export const AccessoryRentalListResponse = paginated(AccessoryRental);
export type AccessoryRentalListResponse = zod.infer<
  typeof AccessoryRentalListResponse
>;

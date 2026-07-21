import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import {
  AccessoryRentalState,
  AccessoryState,
  AccessoryType,
  ChargeBasis,
} from "./enums";

export const Accessory = z.object({
  id: z.number().int(),
  accessory_type: AccessoryType,
  identifier: z.string().nullable(),
  owner_party_id: z.number().int(),
  owner_name: z.string().optional(),
  state: AccessoryState,
  version: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Accessory = z.infer<typeof Accessory>;

export const CreateAccessoryInput = z.object({
  accessory_type: AccessoryType,
  identifier: z.string().min(1).nullable().optional(),
  owner_party_id: z.number().int(),
});
export type CreateAccessoryInput = z.infer<typeof CreateAccessoryInput>;

export const UpdateAccessoryInput = z.object({
  identifier: z.string().min(1).nullable().optional(),
  state: AccessoryState.optional(),
});
export type UpdateAccessoryInput = z.infer<typeof UpdateAccessoryInput>;

export const AccessoryListQuery = PaginationQuery.extend({
  sort: z.enum(["updated_at", "-updated_at"]).default("-updated_at"),
  "filter[accessory_type]": AccessoryType.optional(),
  "filter[state]": AccessoryState.optional(),
});
export type AccessoryListQuery = z.infer<typeof AccessoryListQuery>;

export const AccessoryListResponse = paginated(Accessory);
export type AccessoryListResponse = z.infer<typeof AccessoryListResponse>;

export const AccessoryRental = z.object({
  id: z.number().int(),
  accessory_id: z.number().int(),
  accessory_type: AccessoryType.optional(),
  accessory_identifier: z.string().nullable().optional(),
  client_party_id: z.number().int(),
  client_name: z.string().optional(),
  quantity: z.number().int(),
  start_date: IsoDate,
  end_date: IsoDate.nullable(),
  charge_basis: ChargeBasis,
  remito_id: z.number().int().nullable(),
  state: AccessoryRentalState,
  version: z.number().int(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});
export type AccessoryRental = z.infer<typeof AccessoryRental>;

export const CreateAccessoryRentalInput = z.object({
  accessory_id: z.number().int(),
  client_party_id: z.number().int(),
  quantity: z.number().int().min(1).default(1),
  start_date: IsoDate,
  charge_basis: ChargeBasis.default("RENTAL"),
  remito_number: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type CreateAccessoryRentalInput = z.infer<
  typeof CreateAccessoryRentalInput
>;

export const ReturnAccessoryRentalInput = z.object({
  end_date: IsoDate,
});
export type ReturnAccessoryRentalInput = z.infer<
  typeof ReturnAccessoryRentalInput
>;

export const AccessoryRentalListQuery = PaginationQuery.extend({
  sort: z.enum(["start_date", "-start_date"]).default("-start_date"),
  open: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  "filter[client_party_id]": z.coerce.number().int().optional(),
  "filter[state]": AccessoryRentalState.optional(),
  "filter[accessory_type]": AccessoryType.optional(),
});
export type AccessoryRentalListQuery = z.infer<typeof AccessoryRentalListQuery>;

export const AccessoryRentalListResponse = paginated(AccessoryRental);
export type AccessoryRentalListResponse = z.infer<
  typeof AccessoryRentalListResponse
>;

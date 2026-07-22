import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { GasCode, RatePeriod } from "./enums";

/** Common cylinder sizes (m³) observed in the domain; null rate = any size. */
export const CYLINDER_CAPACITY_OPTIONS = [2, 3, 4, 6, 7, 10, 20] as const;

export const RentalRate = z.object({
  id: z.number().int(),
  client_party_id: z.number().int().nullable(),
  client_name: z.string().nullable().optional(),
  gas_code: GasCode.nullable(),
  /** Null = any cylinder size. */
  capacity_m3: z.number().nullable(),
  period: RatePeriod,
  amount: z.number(),
  effective_from: IsoDate,
  effective_to: IsoDate.nullable(),
});
export type RentalRate = z.infer<typeof RentalRate>;

export const CreateRentalRateInput = z.object({
  client_party_id: z.number().int().nullable().optional(),
  gas_code: GasCode.nullable().optional(),
  capacity_m3: z.coerce.number().positive().nullable().optional(),
  period: RatePeriod.default("DAILY"),
  amount: z.coerce.number().nonnegative(),
  effective_from: IsoDate,
  effective_to: IsoDate.nullable().optional(),
});
export type CreateRentalRateInput = z.infer<typeof CreateRentalRateInput>;

export const UpdateRentalRateInput = z.object({
  client_party_id: z.number().int().nullable().optional(),
  gas_code: GasCode.nullable().optional(),
  capacity_m3: z.coerce.number().positive().nullable().optional(),
  period: RatePeriod.optional(),
  amount: z.coerce.number().nonnegative().optional(),
  effective_from: IsoDate.optional(),
  effective_to: IsoDate.nullable().optional(),
});
export type UpdateRentalRateInput = z.infer<typeof UpdateRentalRateInput>;

export const RentalRateListQuery = PaginationQuery.extend({
  sort: z
    .enum(["effective_from", "-effective_from"])
    .default("-effective_from"),
  "filter[client_party_id]": z.coerce.number().int().optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[capacity_m3]": z.coerce.number().positive().optional(),
});
export type RentalRateListQuery = z.infer<typeof RentalRateListQuery>;

export const RentalRateListResponse = paginated(RentalRate);
export type RentalRateListResponse = z.infer<typeof RentalRateListResponse>;

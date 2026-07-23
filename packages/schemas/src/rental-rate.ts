import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { CapacityUnit, GasCode, RatePeriod } from "./enums";

/** Common cylinder sizes (m³) observed in the domain; null rate = any size. */
export const CYLINDER_CAPACITY_OPTIONS = [2, 3, 4, 6, 7, 10, 20] as const;

/** Common liquefied / weight-sold sizes (kg) observed in legacy sheets. */
export const CYLINDER_CAPACITY_KG_OPTIONS = [
  5, 10, 15, 20, 25, 30, 40, 45, 50,
] as const;

export const RentalRate = zod.object({
  id: zod.number().int(),
  client_party_id: zod.number().int().nullable(),
  client_name: zod.string().nullable().optional(),
  gas_code: GasCode.nullable(),
  /** Null = any cylinder size. Magnitude is in capacity_unit (D-18). */
  capacity_m3: zod.number().nullable(),
  capacity_unit: CapacityUnit,
  period: RatePeriod,
  amount: zod.number(),
  effective_from: IsoDate,
  effective_to: IsoDate.nullable(),
});
export type RentalRate = zod.infer<typeof RentalRate>;

export const CreateRentalRateInput = zod.object({
  client_party_id: zod.number().int().nullable().optional(),
  gas_code: GasCode.nullable().optional(),
  capacity_m3: zod.coerce.number().positive().nullable().optional(),
  capacity_unit: CapacityUnit.default("M3").optional(),
  period: RatePeriod.default("DAILY"),
  amount: zod.coerce.number().nonnegative(),
  effective_from: IsoDate,
  effective_to: IsoDate.nullable().optional(),
});
export type CreateRentalRateInput = zod.infer<typeof CreateRentalRateInput>;

export const UpdateRentalRateInput = zod.object({
  client_party_id: zod.number().int().nullable().optional(),
  gas_code: GasCode.nullable().optional(),
  capacity_m3: zod.coerce.number().positive().nullable().optional(),
  capacity_unit: CapacityUnit.optional(),
  period: RatePeriod.optional(),
  amount: zod.coerce.number().nonnegative().optional(),
  effective_from: IsoDate.optional(),
  effective_to: IsoDate.nullable().optional(),
});
export type UpdateRentalRateInput = zod.infer<typeof UpdateRentalRateInput>;

export const RentalRateListQuery = PaginationQuery.extend({
  sort: zod
    .enum(["effective_from", "-effective_from"])
    .default("-effective_from"),
  "filter[client_party_id]": zod.coerce.number().int().optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[capacity_m3]": zod.coerce.number().positive().optional(),
  "filter[capacity_unit]": CapacityUnit.optional(),
});
export type RentalRateListQuery = zod.infer<typeof RentalRateListQuery>;

export const RentalRateListResponse = paginated(RentalRate);
export type RentalRateListResponse = zod.infer<typeof RentalRateListResponse>;

/**
 * Apply rates to open rentals: fill/raise client daily defaults where useful,
 * then regenerate a history billing draft so charge lines pick up the new price.
 */
export const BackfillRentalRatesInput = zod.object({
  /**
   * When set, scope defaults + billing to this rate's client (if any) and use
   * this row's daily amount for default fill (only when gas/size are wildcards).
   */
  rate_id: zod.number().int().positive().optional(),
});
export type BackfillRentalRatesInput = zod.infer<
  typeof BackfillRentalRatesInput
>;

export const BackfillRentalRatesResult = zod.object({
  /** Clients whose `daily_rate_default` was null and is now set. */
  defaults_filled: zod.number().int().nonnegative(),
  /** Clients that already had a default; amount was added on top. */
  defaults_increased: zod.number().int().nonnegative(),
  billing_run_id: zod.number().int(),
  invoice_count: zod.number().int().nonnegative(),
  /** Charge lines created (open rentals that resolved a price). */
  line_count: zod.number().int().nonnegative(),
  /** Open rentals still without a matching rate or client default. */
  skipped_no_rate: zod.number().int().nonnegative(),
  total: zod.number().nonnegative(),
});
export type BackfillRentalRatesResult = zod.infer<
  typeof BackfillRentalRatesResult
>;

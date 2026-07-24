import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { CapacityUnit, GasCode } from "./enums";

/**
 * Per-fill gas price for REFILL / Su Propiedad (customer-owned) cylinders.
 * Null gas / capacity act as wildcards. Not client-specific (014).
 */
export const RefillRate = zod.object({
  id: zod.number().int(),
  gas_code: GasCode.nullable(),
  /** Null = any cylinder size. Magnitude is in capacity_unit (D-18). */
  capacity_m3: zod.number().nullable(),
  capacity_unit: CapacityUnit,
  amount: zod.number(),
  effective_from: IsoDate,
  effective_to: IsoDate.nullable(),
});
export type RefillRate = zod.infer<typeof RefillRate>;

export const CreateRefillRateInput = zod.object({
  gas_code: GasCode.nullable().optional(),
  capacity_m3: zod.coerce.number().positive().nullable().optional(),
  capacity_unit: CapacityUnit.default("M3").optional(),
  amount: zod.coerce.number().nonnegative(),
  effective_from: IsoDate,
  effective_to: IsoDate.nullable().optional(),
});
export type CreateRefillRateInput = zod.infer<typeof CreateRefillRateInput>;

export const UpdateRefillRateInput = zod.object({
  gas_code: GasCode.nullable().optional(),
  capacity_m3: zod.coerce.number().positive().nullable().optional(),
  capacity_unit: CapacityUnit.optional(),
  amount: zod.coerce.number().nonnegative().optional(),
  effective_from: IsoDate.optional(),
  effective_to: IsoDate.nullable().optional(),
});
export type UpdateRefillRateInput = zod.infer<typeof UpdateRefillRateInput>;

export const RefillRateListQuery = PaginationQuery.extend({
  sort: zod
    .enum(["effective_from", "-effective_from"])
    .default("-effective_from"),
  "filter[gas_code]": GasCode.optional(),
  "filter[capacity_m3]": zod.coerce.number().positive().optional(),
  "filter[capacity_unit]": CapacityUnit.optional(),
});
export type RefillRateListQuery = zod.infer<typeof RefillRateListQuery>;

export const RefillRateListResponse = paginated(RefillRate);
export type RefillRateListResponse = zod.infer<typeof RefillRateListResponse>;

/**
 * Apply refill rates to open fills: regenerate a history billing draft so
 * OPEN REFILL movements pick up current per-fill prices (014 R10).
 * No client daily defaults — refill_rate has no client dimension (D-19).
 */
export const BackfillRefillRatesInput = zod.object({
  /**
   * When set, verifies the rate exists (edit-drawer affordance). Billing
   * remains global — refill rates are not client-scoped.
   */
  rate_id: zod.number().int().positive().optional(),
});
export type BackfillRefillRatesInput = zod.infer<
  typeof BackfillRefillRatesInput
>;

export const BackfillRefillRatesResult = zod.object({
  billing_run_id: zod.number().int(),
  invoice_count: zod.number().int().nonnegative(),
  /** Charge lines created (open movements that resolved a price). */
  line_count: zod.number().int().nonnegative(),
  /** Open refills (and rentals in the same draft) still without a matching rate. */
  skipped_no_rate: zod.number().int().nonnegative(),
  total: zod.number().nonnegative(),
});
export type BackfillRefillRatesResult = zod.infer<
  typeof BackfillRefillRatesResult
>;

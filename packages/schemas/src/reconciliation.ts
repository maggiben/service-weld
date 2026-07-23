import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { CylinderState, GasCode } from "./enums";

/** Open movement float row (US-25 / GET /reports/outstanding). */
export const OutstandingRow = zod.object({
  movement_id: zod.number().int(),
  cylinder_id: zod.number().int(),
  serial_number: zod.string(),
  client_party_id: zod.number().int(),
  client_name: zod.string(),
  gas_code: GasCode.nullable(),
  delivery_date: IsoDate,
  accrued_days: zod.number().int(),
  to_verify: zod.boolean(),
  cylinder_state: CylinderState,
});
export type OutstandingRow = zod.infer<typeof OutstandingRow>;

export const OutstandingListQuery = PaginationQuery.extend({
  sort: zod
    .enum(["accrued_days", "-accrued_days", "delivery_date", "-delivery_date"])
    .default("-accrued_days"),
  "filter[client_party_id]": zod.coerce.number().int().optional(),
  min_days: zod.coerce.number().int().min(0).optional(),
  as_of: IsoDate.optional(),
});
export type OutstandingListQuery = zod.infer<typeof OutstandingListQuery>;

export const OutstandingListResponse = paginated(OutstandingRow);
export type OutstandingListResponse = zod.infer<typeof OutstandingListResponse>;

export const ReconciliationVarianceKind = zod.enum([
  "MATCHED",
  "PRESENT_ELSEWHERE",
  "ABSENT_HERE",
  "UNKNOWN_SERIAL",
]);
export type ReconciliationVarianceKind = zod.infer<
  typeof ReconciliationVarianceKind
>;

export const ReconciliationVarianceRow = zod.object({
  kind: ReconciliationVarianceKind,
  cylinder_id: zod.number().int().nullable(),
  serial_number: zod.string(),
  system_state: zod.string().nullable(),
  /** Current custody party when the system shows AT_CLIENT / AT_SUPPLIER. */
  holder_name: zod.string().nullable().optional(),
  suggested_action: zod.enum(["NONE", "LOSS", "TRANSFER", "VERIFY"]).optional(),
});
export type ReconciliationVarianceRow = zod.infer<
  typeof ReconciliationVarianceRow
>;

export const PhysicalCountInput = zod
  .object({
    counted_on: IsoDate,
    serial_numbers: zod.array(zod.string().min(1)).default([]),
    cylinder_ids: zod.array(zod.number().int()).default([]),
    /**
     * When true, every in-stock cylinder not in the counted list is reported
     * as ABSENT_HERE (suggested LOSS). Default false so a partial list only
     * classifies the serials provided (matched / elsewhere / unknown).
     */
    full_plant_count: zod.boolean().default(false),
  })
  .refine(
    (value) => value.serial_numbers.length > 0 || value.cylinder_ids.length > 0,
    {
      message: "Provide at least one serial or cylinder id",
    },
  );
export type PhysicalCountInput = zod.infer<typeof PhysicalCountInput>;

export const PhysicalCountResult = zod.object({
  counted_on: IsoDate,
  counted: zod.number().int(),
  matched: zod.number().int(),
  present_elsewhere: zod.number().int(),
  absent_here: zod.number().int(),
  unknown_serial: zod.number().int(),
  rows: zod.array(ReconciliationVarianceRow),
});
export type PhysicalCountResult = zod.infer<typeof PhysicalCountResult>;

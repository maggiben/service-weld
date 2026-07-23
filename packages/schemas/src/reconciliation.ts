import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { GasCode } from "./enums";

/** Open movement float row (US-25 / GET /reports/outstanding). */
export const OutstandingRow = z.object({
  movement_id: z.number().int(),
  cylinder_id: z.number().int(),
  serial_number: z.string(),
  client_party_id: z.number().int(),
  client_name: z.string(),
  gas_code: GasCode.nullable(),
  delivery_date: IsoDate,
  accrued_days: z.number().int(),
  to_verify: z.boolean(),
});
export type OutstandingRow = z.infer<typeof OutstandingRow>;

export const OutstandingListQuery = PaginationQuery.extend({
  sort: z
    .enum(["accrued_days", "-accrued_days", "delivery_date", "-delivery_date"])
    .default("-accrued_days"),
  "filter[client_party_id]": z.coerce.number().int().optional(),
  min_days: z.coerce.number().int().min(0).optional(),
  as_of: IsoDate.optional(),
});
export type OutstandingListQuery = z.infer<typeof OutstandingListQuery>;

export const OutstandingListResponse = paginated(OutstandingRow);
export type OutstandingListResponse = z.infer<typeof OutstandingListResponse>;

export const ReconciliationVarianceKind = z.enum([
  "MATCHED",
  "PRESENT_ELSEWHERE",
  "ABSENT_HERE",
  "UNKNOWN_SERIAL",
]);
export type ReconciliationVarianceKind = z.infer<
  typeof ReconciliationVarianceKind
>;

export const ReconciliationVarianceRow = z.object({
  kind: ReconciliationVarianceKind,
  cylinder_id: z.number().int().nullable(),
  serial_number: z.string(),
  system_state: z.string().nullable(),
  /** Current custody party when the system shows AT_CLIENT / AT_SUPPLIER. */
  holder_name: z.string().nullable().optional(),
  suggested_action: z.enum(["NONE", "LOSS", "TRANSFER", "VERIFY"]).optional(),
});
export type ReconciliationVarianceRow = z.infer<
  typeof ReconciliationVarianceRow
>;

export const PhysicalCountInput = z
  .object({
    counted_on: IsoDate,
    serial_numbers: z.array(z.string().min(1)).default([]),
    cylinder_ids: z.array(z.number().int()).default([]),
    /**
     * When true, every in-stock cylinder not in the counted list is reported
     * as ABSENT_HERE (suggested LOSS). Default false so a partial list only
     * classifies the serials provided (matched / elsewhere / unknown).
     */
    full_plant_count: z.boolean().default(false),
  })
  .refine((v) => v.serial_numbers.length > 0 || v.cylinder_ids.length > 0, {
    message: "Provide at least one serial or cylinder id",
  });
export type PhysicalCountInput = z.infer<typeof PhysicalCountInput>;

export const PhysicalCountResult = z.object({
  counted_on: IsoDate,
  counted: z.number().int(),
  matched: z.number().int(),
  present_elsewhere: z.number().int(),
  absent_here: z.number().int(),
  unknown_serial: z.number().int(),
  rows: z.array(ReconciliationVarianceRow),
});
export type PhysicalCountResult = z.infer<typeof PhysicalCountResult>;

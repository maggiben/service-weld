import { z as zod } from "zod";
import { IsoDate, PageMeta, PaginationQuery } from "./common";
import { GasCode, OwnershipBasis } from "./enums";

export const ReportEnvelope = <T extends zod.ZodTypeAny>(row: T) =>
  zod.object({
    data: zod.array(row),
    generated_at: zod.string().datetime(),
    page: PageMeta.optional(),
  });

export const FleetRow = zod.object({
  group_key: zod.string(),
  state: zod.string().optional(),
  gas_code: GasCode.nullable().optional(),
  owner_party_id: zod.number().int().optional(),
  owner_name: zod.string().optional(),
  locality_id: zod.number().int().nullable().optional(),
  locality_name: zod.string().nullable().optional(),
  client_party_id: zod.number().int().optional(),
  client_name: zod.string().optional(),
  count: zod.number().int(),
});
export type FleetRow = zod.infer<typeof FleetRow>;

export const FleetQuery = zod.object({
  group_by: zod
    .enum(["state", "gas_code", "owner", "locality", "client"])
    .default("state"),
  /** Reconstruct fleet stock as of this business date (inclusive). Omit = today. */
  as_of: IsoDate.optional(),
  /**
   * When both set (with state/gas_code), count custody starts in the inclusive
   * range (client deliveries + supplier receives). Nested lookbacks accumulate.
   */
  period_start: IsoDate.optional(),
  period_end: IsoDate.optional(),
  "filter[owner_party_id]": zod.coerce.number().int().optional(),
  "filter[gas_code]": GasCode.optional(),
});
export type FleetQuery = zod.infer<typeof FleetQuery>;

export const FloatAgingRow = zod.object({
  movement_id: zod.number().int(),
  cylinder_id: zod.number().int(),
  serial_number: zod.string(),
  client_party_id: zod.number().int(),
  client_name: zod.string(),
  delivery_date: IsoDate,
  days_out: zod.number().int(),
  bucket: zod.enum([">30", ">90", ">180", ">365", "≤30"]),
});
export type FloatAgingRow = zod.infer<typeof FloatAgingRow>;

export const FloatAgingQuery = PaginationQuery.extend({
  sort: zod.enum(["days_out", "-days_out"]).default("-days_out"),
  bucket: zod.enum([">30", ">90", ">180", ">365"]).optional(),
  "filter[territory_id]": zod.coerce.number().int().optional(),
  /** Snapshot of currently open float as of this date. Omit = today. */
  as_of: IsoDate.optional(),
  /**
   * When both set: custody overlapping the inclusive range (open + closed),
   * aged as of period_end (or return if earlier). Longer windows accumulate.
   */
  period_start: IsoDate.optional(),
  period_end: IsoDate.optional(),
});
export type FloatAgingQuery = zod.infer<typeof FloatAgingQuery>;

export const RentalReportRow = zod.object({
  client_party_id: zod.number().int(),
  client_name: zod.string(),
  gas_code: GasCode.nullable(),
  rental_days: zod.number(),
  revenue: zod.number(),
  movement_count: zod.number().int(),
});
export type RentalReportRow = zod.infer<typeof RentalReportRow>;

export const RentalReportQuery = zod.object({
  period_start: IsoDate,
  period_end: IsoDate,
  "filter[territory_id]": zod.coerce.number().int().optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[client_party_id]": zod.coerce.number().int().optional(),
  "filter[cylinder_id]": zod.coerce.number().int().optional(),
});
export type RentalReportQuery = zod.infer<typeof RentalReportQuery>;

export const LossReportRow = zod.object({
  owner_party_id: zod.number().int(),
  owner_name: zod.string(),
  ownership_basis: OwnershipBasis,
  state: zod.enum(["LOST", "BROKEN"]),
  count: zod.number().int(),
  liability: zod.enum(["SUPPLIER", "OURS", "CUSTOMER"]),
});
export type LossReportRow = zod.infer<typeof LossReportRow>;

export const LossReportQuery = zod.object({
  period_start: IsoDate.optional(),
  period_end: IsoDate.optional(),
  "filter[owner_party_id]": zod.coerce.number().int().optional(),
});
export type LossReportQuery = zod.infer<typeof LossReportQuery>;

export const SupplierReturnsRow = zod.object({
  loan_id: zod.number().int(),
  cylinder_id: zod.number().int(),
  serial_number: zod.string().optional(),
  supplier_party_id: zod.number().int(),
  supplier_name: zod.string(),
  stage: zod.string(),
  received_from_supplier: IsoDate.nullable(),
  days_open: zod.number().int(),
});
export type SupplierReturnsRow = zod.infer<typeof SupplierReturnsRow>;

export const SupplierReturnsQuery = PaginationQuery.extend({
  sort: zod.enum(["days_open", "-days_open"]).default("-days_open"),
  min_days: zod.coerce.number().int().min(0).optional(),
  "filter[supplier_party_id]": zod.coerce.number().int().optional(),
  as_of: IsoDate.optional(),
  /** When both set: loans whose custody overlapped the inclusive range. */
  period_start: IsoDate.optional(),
  period_end: IsoDate.optional(),
});
export type SupplierReturnsQuery = zod.infer<typeof SupplierReturnsQuery>;

export const CylinderLifeRow = zod.object({
  event_source: zod.enum(["MOVEMENT", "SUPPLIER_LOAN"]),
  movement_id: zod.number().int().nullable(),
  loan_id: zod.number().int().nullable(),
  holder_party_id: zod.number().int(),
  holder_name: zod.string(),
  movement_kind: zod.string(),
  delivery_date: IsoDate,
  return_date: IsoDate.nullable(),
  rental_days: zod.number().int().nullable(),
  state: zod.string(),
  note: zod.string().nullable(),
});
export type CylinderLifeRow = zod.infer<typeof CylinderLifeRow>;

export const DataQualityRow = zod.object({
  id: zod.number().int(),
  source: zod.string(),
  reason: zod.string(),
  sheet: zod.string().nullable().optional(),
  row_ref: zod.string().nullable().optional(),
  status: zod.string(),
  created_at: zod.string().datetime(),
});
export type DataQualityRow = zod.infer<typeof DataQualityRow>;

export const DataQualityQuery = PaginationQuery.extend({
  sort: zod.enum(["created_at", "-created_at"]).default("-created_at"),
  "filter[type]": zod.string().optional(),
});
export type DataQualityQuery = zod.infer<typeof DataQualityQuery>;

export const MedicalStatementRow = zod.object({
  client_party_id: zod.number().int(),
  client_name: zod.string(),
  deliveries: zod.number().int(),
  rental_days: zod.number(),
  accessory_rentals: zod.number().int(),
});
export type MedicalStatementRow = zod.infer<typeof MedicalStatementRow>;

export const MedicalStatementQuery = zod.object({
  period_start: IsoDate,
  period_end: IsoDate,
  "filter[client_party_id]": zod.coerce.number().int().optional(),
});
export type MedicalStatementQuery = zod.infer<typeof MedicalStatementQuery>;

export const CylinderLifeQuery = zod.object({
  gte: IsoDate.optional(),
  lte: IsoDate.optional(),
});
export type CylinderLifeQuery = zod.infer<typeof CylinderLifeQuery>;

export const FleetReportResponse = ReportEnvelope(FleetRow);
export type FleetReportResponse = zod.infer<typeof FleetReportResponse>;

export const FloatAgingReportResponse = ReportEnvelope(FloatAgingRow).extend({
  page: PageMeta,
});
export type FloatAgingReportResponse = zod.infer<
  typeof FloatAgingReportResponse
>;

export const RentalReportResponse = ReportEnvelope(RentalReportRow);
export type RentalReportResponse = zod.infer<typeof RentalReportResponse>;

export const RefillReportRow = zod.object({
  client_party_id: zod.number().int(),
  client_name: zod.string(),
  gas_code: GasCode.nullable(),
  refill_count: zod.number().int(),
  revenue: zod.number(),
});
export type RefillReportRow = zod.infer<typeof RefillReportRow>;

export const RefillReportQuery = zod.object({
  period_start: IsoDate,
  period_end: IsoDate,
  "filter[territory_id]": zod.coerce.number().int().optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[client_party_id]": zod.coerce.number().int().optional(),
});
export type RefillReportQuery = zod.infer<typeof RefillReportQuery>;

export const RefillReportResponse = ReportEnvelope(RefillReportRow);
export type RefillReportResponse = zod.infer<typeof RefillReportResponse>;

export const LossReportResponse = ReportEnvelope(LossReportRow);
export type LossReportResponse = zod.infer<typeof LossReportResponse>;

export const SupplierReturnsReportResponse = ReportEnvelope(
  SupplierReturnsRow,
).extend({
  page: PageMeta,
});
export type SupplierReturnsReportResponse = zod.infer<
  typeof SupplierReturnsReportResponse
>;

export const CylinderLifeReportResponse = ReportEnvelope(CylinderLifeRow);
export type CylinderLifeReportResponse = zod.infer<
  typeof CylinderLifeReportResponse
>;

export const DataQualityReportResponse = ReportEnvelope(DataQualityRow).extend({
  page: PageMeta,
});
export type DataQualityReportResponse = zod.infer<
  typeof DataQualityReportResponse
>;

export const MedicalStatementReportResponse =
  ReportEnvelope(MedicalStatementRow);
export type MedicalStatementReportResponse = zod.infer<
  typeof MedicalStatementReportResponse
>;

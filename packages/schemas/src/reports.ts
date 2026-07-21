import { z } from "zod";
import { IsoDate, PageMeta, PaginationQuery } from "./common";
import { GasCode, OwnershipBasis } from "./enums";

export const ReportEnvelope = <T extends z.ZodTypeAny>(row: T) =>
  z.object({
    data: z.array(row),
    generated_at: z.string().datetime(),
    page: PageMeta.optional(),
  });

export const FleetRow = z.object({
  group_key: z.string(),
  state: z.string().optional(),
  gas_code: GasCode.nullable().optional(),
  owner_party_id: z.number().int().optional(),
  owner_name: z.string().optional(),
  count: z.number().int(),
});
export type FleetRow = z.infer<typeof FleetRow>;

export const FleetQuery = z.object({
  group_by: z.enum(["state", "gas_code", "owner"]).default("state"),
  "filter[owner_party_id]": z.coerce.number().int().optional(),
  "filter[gas_code]": GasCode.optional(),
});
export type FleetQuery = z.infer<typeof FleetQuery>;

export const FloatAgingRow = z.object({
  movement_id: z.number().int(),
  cylinder_id: z.number().int(),
  serial_number: z.string(),
  client_party_id: z.number().int(),
  client_name: z.string(),
  delivery_date: IsoDate,
  days_out: z.number().int(),
  bucket: z.enum([">30", ">90", ">180", ">365", "≤30"]),
});
export type FloatAgingRow = z.infer<typeof FloatAgingRow>;

export const FloatAgingQuery = PaginationQuery.extend({
  sort: z.enum(["days_out", "-days_out"]).default("-days_out"),
  bucket: z.enum([">30", ">90", ">180", ">365"]).optional(),
  "filter[territory_id]": z.coerce.number().int().optional(),
  as_of: IsoDate.optional(),
});
export type FloatAgingQuery = z.infer<typeof FloatAgingQuery>;

export const RentalReportRow = z.object({
  client_party_id: z.number().int(),
  client_name: z.string(),
  gas_code: GasCode.nullable(),
  rental_days: z.number(),
  revenue: z.number(),
  movement_count: z.number().int(),
});
export type RentalReportRow = z.infer<typeof RentalReportRow>;

export const RentalReportQuery = z.object({
  period_start: IsoDate,
  period_end: IsoDate,
  "filter[territory_id]": z.coerce.number().int().optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[client_party_id]": z.coerce.number().int().optional(),
  "filter[cylinder_id]": z.coerce.number().int().optional(),
});
export type RentalReportQuery = z.infer<typeof RentalReportQuery>;

export const LossReportRow = z.object({
  owner_party_id: z.number().int(),
  owner_name: z.string(),
  ownership_basis: OwnershipBasis,
  state: z.enum(["LOST", "BROKEN"]),
  count: z.number().int(),
  liability: z.enum(["SUPPLIER", "OURS", "CUSTOMER"]),
});
export type LossReportRow = z.infer<typeof LossReportRow>;

export const LossReportQuery = z.object({
  period_start: IsoDate.optional(),
  period_end: IsoDate.optional(),
  "filter[owner_party_id]": z.coerce.number().int().optional(),
});
export type LossReportQuery = z.infer<typeof LossReportQuery>;

export const SupplierReturnsRow = z.object({
  loan_id: z.number().int(),
  cylinder_id: z.number().int(),
  serial_number: z.string().optional(),
  supplier_party_id: z.number().int(),
  supplier_name: z.string(),
  stage: z.string(),
  received_from_supplier: IsoDate.nullable(),
  days_open: z.number().int(),
});
export type SupplierReturnsRow = z.infer<typeof SupplierReturnsRow>;

export const SupplierReturnsQuery = PaginationQuery.extend({
  sort: z.enum(["days_open", "-days_open"]).default("-days_open"),
  min_days: z.coerce.number().int().min(0).optional(),
  "filter[supplier_party_id]": z.coerce.number().int().optional(),
  as_of: IsoDate.optional(),
});
export type SupplierReturnsQuery = z.infer<typeof SupplierReturnsQuery>;

export const CylinderLifeRow = z.object({
  event_source: z.enum(["MOVEMENT", "SUPPLIER_LOAN"]),
  movement_id: z.number().int().nullable(),
  loan_id: z.number().int().nullable(),
  holder_party_id: z.number().int(),
  holder_name: z.string(),
  movement_kind: z.string(),
  delivery_date: IsoDate,
  return_date: IsoDate.nullable(),
  rental_days: z.number().int().nullable(),
  state: z.string(),
  note: z.string().nullable(),
});
export type CylinderLifeRow = z.infer<typeof CylinderLifeRow>;

export const DataQualityRow = z.object({
  id: z.number().int(),
  source: z.string(),
  reason: z.string(),
  sheet: z.string().nullable().optional(),
  row_ref: z.string().nullable().optional(),
  status: z.string(),
  created_at: z.string().datetime(),
});
export type DataQualityRow = z.infer<typeof DataQualityRow>;

export const DataQualityQuery = PaginationQuery.extend({
  sort: z.enum(["created_at", "-created_at"]).default("-created_at"),
  "filter[type]": z.string().optional(),
});
export type DataQualityQuery = z.infer<typeof DataQualityQuery>;

export const MedicalStatementRow = z.object({
  client_party_id: z.number().int(),
  client_name: z.string(),
  deliveries: z.number().int(),
  rental_days: z.number(),
  accessory_rentals: z.number().int(),
});
export type MedicalStatementRow = z.infer<typeof MedicalStatementRow>;

export const MedicalStatementQuery = z.object({
  period_start: IsoDate,
  period_end: IsoDate,
  "filter[client_party_id]": z.coerce.number().int().optional(),
});
export type MedicalStatementQuery = z.infer<typeof MedicalStatementQuery>;

export const CylinderLifeQuery = z.object({
  gte: IsoDate.optional(),
  lte: IsoDate.optional(),
});
export type CylinderLifeQuery = z.infer<typeof CylinderLifeQuery>;

export const FleetReportResponse = ReportEnvelope(FleetRow);
export type FleetReportResponse = z.infer<typeof FleetReportResponse>;

export const FloatAgingReportResponse = ReportEnvelope(FloatAgingRow).extend({
  page: PageMeta,
});
export type FloatAgingReportResponse = z.infer<typeof FloatAgingReportResponse>;

export const RentalReportResponse = ReportEnvelope(RentalReportRow);
export type RentalReportResponse = z.infer<typeof RentalReportResponse>;

export const LossReportResponse = ReportEnvelope(LossReportRow);
export type LossReportResponse = z.infer<typeof LossReportResponse>;

export const SupplierReturnsReportResponse = ReportEnvelope(
  SupplierReturnsRow,
).extend({
  page: PageMeta,
});
export type SupplierReturnsReportResponse = z.infer<
  typeof SupplierReturnsReportResponse
>;

export const CylinderLifeReportResponse = ReportEnvelope(CylinderLifeRow);
export type CylinderLifeReportResponse = z.infer<
  typeof CylinderLifeReportResponse
>;

export const DataQualityReportResponse = ReportEnvelope(DataQualityRow).extend({
  page: PageMeta,
});
export type DataQualityReportResponse = z.infer<
  typeof DataQualityReportResponse
>;

export const MedicalStatementReportResponse =
  ReportEnvelope(MedicalStatementRow);
export type MedicalStatementReportResponse = z.infer<
  typeof MedicalStatementReportResponse
>;

import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import {
  CapacityUnit,
  CylinderCondition,
  GasCode,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  OwnershipBasis,
  PrintCopyKind,
  RemitoLineKind,
} from "./enums";

export const Warehouse = zod.object({
  id: zod.number().int(),
  code: zod.string(),
  name: zod.string(),
  territory_id: zod.number().int().nullable(),
  address: zod.string().nullable().optional(),
  is_active: zod.boolean(),
});
export type Warehouse = zod.infer<typeof Warehouse>;

export const Vehicle = zod.object({
  id: zod.number().int(),
  plate: zod.string(),
  name: zod.string().nullable(),
  capacity_units: zod.number().int().nullable().optional(),
  capacity_weight: zod.number().nullable().optional(),
  is_active: zod.boolean(),
});
export type Vehicle = zod.infer<typeof Vehicle>;

export const DriverProfile = zod.object({
  id: zod.number().int(),
  user_id: zod.number().int().nullable(),
  display_name: zod.string(),
  phone: zod.string().nullable().optional(),
  license_no: zod.string().nullable().optional(),
  license_expiry: IsoDate.nullable().optional(),
  default_vehicle_id: zod.number().int().nullable().optional(),
  is_helper_eligible: zod.boolean(),
  is_active: zod.boolean(),
});
export type DriverProfile = zod.infer<typeof DriverProfile>;

export const RemitoSeries = zod.object({
  id: zod.number().int(),
  code: zod.string(),
  emission_point_label: zod.string().nullable().optional(),
  pad_width: zod.number().int(),
  next_number: zod.number().int(),
  is_active: zod.boolean(),
});
export type RemitoSeries = zod.infer<typeof RemitoSeries>;

export const RemitoLine = zod.object({
  id: zod.number().int(),
  remito_id: zod.number().int(),
  line_no: zod.number().int(),
  item_kind: RemitoLineKind,
  cylinder_id: zod.number().int().nullable(),
  battery_id: zod.number().int().nullable().optional(),
  accessory_id: zod.number().int().nullable().optional(),
  serial_number: zod.string().nullable(),
  gas_code: GasCode.nullable().optional(),
  capacity_value: zod.number().nullable().optional(),
  capacity_unit: CapacityUnit.nullable().optional(),
  owner_party_id: zod.number().int().nullable().optional(),
  is_rental: zod.boolean(),
  ownership_basis: OwnershipBasis.nullable().optional(),
  qty: zod.number(),
  picked_qty: zod.number(),
  delivered_qty: zod.number().nullable().optional(),
  returned_qty: zod.number().nullable().optional(),
  unit: zod.string().nullable().optional(),
  pressure: zod.number().nullable().optional(),
  condition: CylinderCondition.nullable().optional(),
  barcode: zod.string().nullable().optional(),
  qr_code: zod.string().nullable().optional(),
  movement_event_id: zod.number().int().nullable().optional(),
  accessory_rental_id: zod.number().int().nullable().optional(),
  weight_kg: zod.number().nullable().optional(),
  notes: zod.string().nullable().optional(),
  scanned_at: zod.string().datetime().nullable().optional(),
});
export type RemitoLine = zod.infer<typeof RemitoLine>;

export const CreateRemitoLineInput = zod.object({
  item_kind: RemitoLineKind.default("CYLINDER"),
  cylinder_id: zod.number().int().nullable().optional(),
  battery_id: zod.number().int().nullable().optional(),
  accessory_id: zod.number().int().nullable().optional(),
  qty: zod.coerce.number().positive().default(1),
  is_rental: zod.boolean().optional(),
  notes: zod.string().trim().max(2000).nullable().optional(),
});
export type CreateRemitoLineInput = zod.infer<typeof CreateRemitoLineInput>;

export const UpdateRemitoLineInput = zod.object({
  qty: zod.coerce.number().positive().optional(),
  picked_qty: zod.coerce.number().nonnegative().optional(),
  delivered_qty: zod.coerce.number().nonnegative().nullable().optional(),
  returned_qty: zod.coerce.number().nonnegative().nullable().optional(),
  is_rental: zod.boolean().optional(),
  pressure: zod.coerce.number().nullable().optional(),
  condition: CylinderCondition.nullable().optional(),
  notes: zod.string().trim().max(2000).nullable().optional(),
});
export type UpdateRemitoLineInput = zod.infer<typeof UpdateRemitoLineInput>;

export const RemitoIncident = zod.object({
  id: zod.number().int(),
  remito_id: zod.number().int(),
  line_id: zod.number().int().nullable(),
  type: IncidentType,
  severity: IncidentSeverity,
  status: IncidentStatus,
  description: zod.string(),
  reported_by: zod.number().int().nullable().optional(),
  reported_at: zod.string().datetime(),
  resolution: zod.string().nullable().optional(),
  resolved_by: zod.number().int().nullable().optional(),
  resolved_at: zod.string().datetime().nullable().optional(),
});
export type RemitoIncident = zod.infer<typeof RemitoIncident>;

export const CreateRemitoIncidentInput = zod.object({
  type: IncidentType,
  severity: IncidentSeverity.default("MEDIUM"),
  description: zod.string().trim().min(1).max(4000),
  line_id: zod.number().int().nullable().optional(),
});
export type CreateRemitoIncidentInput = zod.infer<
  typeof CreateRemitoIncidentInput
>;

export const UpdateRemitoIncidentInput = zod.object({
  status: IncidentStatus.optional(),
  severity: IncidentSeverity.optional(),
  resolution: zod.string().trim().max(4000).nullable().optional(),
  description: zod.string().trim().min(1).max(4000).optional(),
});
export type UpdateRemitoIncidentInput = zod.infer<
  typeof UpdateRemitoIncidentInput
>;

export const WarehouseListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
});
export type WarehouseListQuery = zod.infer<typeof WarehouseListQuery>;
export const WarehouseListResponse = paginated(Warehouse);
export type WarehouseListResponse = zod.infer<typeof WarehouseListResponse>;

export const VehicleListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
});
export type VehicleListQuery = zod.infer<typeof VehicleListQuery>;
export const VehicleListResponse = paginated(Vehicle);
export type VehicleListResponse = zod.infer<typeof VehicleListResponse>;

export const DriverListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
  helpers_only: zod.coerce.boolean().optional(),
});
export type DriverListQuery = zod.infer<typeof DriverListQuery>;
export const DriverListResponse = paginated(DriverProfile);
export type DriverListResponse = zod.infer<typeof DriverListResponse>;

export const CreateVehicleInput = zod.object({
  plate: zod.string().trim().min(1).max(32),
  name: zod.string().trim().max(120).nullable().optional(),
  capacity_units: zod.number().int().positive().nullable().optional(),
  capacity_weight: zod.coerce.number().positive().nullable().optional(),
});
export type CreateVehicleInput = zod.infer<typeof CreateVehicleInput>;

export const CreateDriverProfileInput = zod.object({
  display_name: zod.string().trim().min(1).max(120),
  user_id: zod.number().int().nullable().optional(),
  phone: zod.string().trim().max(40).nullable().optional(),
  license_no: zod.string().trim().max(64).nullable().optional(),
  license_expiry: IsoDate.nullable().optional(),
  default_vehicle_id: zod.number().int().nullable().optional(),
  is_helper_eligible: zod.boolean().default(true),
});
export type CreateDriverProfileInput = zod.infer<
  typeof CreateDriverProfileInput
>;

export const RemitoPrintLog = zod.object({
  id: zod.number().int(),
  remito_id: zod.number().int(),
  copy_kind: PrintCopyKind,
  reprint_seq: zod.number().int().nullable(),
  reason: zod.string().nullable(),
  printed_by: zod.number().int().nullable(),
  printed_at: zod.string().datetime(),
  pdf_object_ref: zod.string().nullable().optional(),
  content_version: zod.number().int().nullable().optional(),
});
export type RemitoPrintLog = zod.infer<typeof RemitoPrintLog>;

export const PrintRemitoPdfQuery = zod
  .object({
    copy: PrintCopyKind.default("ORIGINAL"),
    reason: zod.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.copy === "REIMPRESION" && !value.reason?.trim()) {
      context.addIssue({
        code: zod.ZodIssueCode.custom,
        path: ["reason"],
        message: "Reprint reason is required",
      });
    }
  });
export type PrintRemitoPdfQuery = zod.infer<typeof PrintRemitoPdfQuery>;

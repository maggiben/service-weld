import { z as zod } from "zod";
import { IsoDate, PageMeta, paginated, PaginationQuery } from "./common";
import {
  CapacityUnit,
  CylinderCondition,
  CylinderState,
  GasCode,
  MovementState,
  OwnershipBasis,
  PackagingKind,
} from "./enums";

export const Cylinder = zod.object({
  id: zod.number().int(),
  owner_party_id: zod.number().int(),
  owner_name: zod.string().optional(),
  serial_number: zod.string(),
  gas_code: GasCode.nullable(),
  /** Magnitude; unit is capacity_unit (D-18). Legacy column name. */
  capacity_m3: zod.number().nullable(),
  capacity_unit: CapacityUnit,
  ownership_basis: OwnershipBasis,
  packaging: PackagingKind,
  battery_id: zod.number().int().nullable(),
  home_territory_id: zod.number().int().nullable(),
  state: CylinderState,
  condition: CylinderCondition,
  acquisition_date: IsoDate.nullable(),
  version: zod.number().int(),
  created_at: zod.string().datetime(),
  updated_at: zod.string().datetime().optional(),
  current_holder_party_id: zod.number().int().nullable().optional(),
  current_holder_name: zod.string().nullable().optional(),
  current_movement_id: zod.number().int().nullable().optional(),
  /** Current city: client locality/territory when out, else home depot when in stock. */
  current_location_name: zod.string().nullable().optional(),
});
export type Cylinder = zod.infer<typeof Cylinder>;

export const CreateCylinderInput = zod.object({
  owner_party_id: zod.number().int(),
  serial_number: zod.string().min(1),
  gas_code: GasCode.nullable().optional(),
  capacity_m3: zod.coerce.number().positive().nullable().optional(),
  capacity_unit: CapacityUnit.default("M3").optional(),
  ownership_basis: OwnershipBasis,
  packaging: PackagingKind.default("SINGLE"),
  home_territory_id: zod.number().int().nullable().optional(),
  acquisition_date: IsoDate.nullable().optional(),
  condition: CylinderCondition.default("EMPTY"),
});
export type CreateCylinderInput = zod.infer<typeof CreateCylinderInput>;

/**
 * Correct mutable attributes that do not rewrite the custody ledger
 * (gas, capacity, home depot, acquisition date). State/owner/serial
 * changes use dedicated endpoints.
 */
export const UpdateCylinderInput = zod
  .object({
    gas_code: GasCode.nullable().optional(),
    capacity_m3: zod.coerce.number().positive().nullable().optional(),
    capacity_unit: CapacityUnit.optional(),
    home_territory_id: zod.number().int().nullable().optional(),
    acquisition_date: IsoDate.nullable().optional(),
  })
  .refine(
    (value) =>
      value.gas_code !== undefined ||
      value.capacity_m3 !== undefined ||
      value.capacity_unit !== undefined ||
      value.home_territory_id !== undefined ||
      value.acquisition_date !== undefined,
    { message: "At least one field is required" },
  );
export type UpdateCylinderInput = zod.infer<typeof UpdateCylinderInput>;

export const CylinderListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
  sort: zod
    .enum([
      "serial_number",
      "-serial_number",
      "updated_at",
      "-updated_at",
      "state",
      "-state",
      "current_location_name",
      "-current_location_name",
      "gas_code",
      "-gas_code",
      "capacity_m3",
      "-capacity_m3",
      "ownership_basis",
      "-ownership_basis",
      "owner_name",
      "-owner_name",
      "current_holder_name",
      "-current_holder_name",
      "condition",
      "-condition",
      "home_territory_id",
      "-home_territory_id",
    ])
    .default("serial_number"),
  "filter[state]": CylinderState.optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[owner_party_id]": zod.coerce.number().int().optional(),
  "filter[ownership_basis]": OwnershipBasis.optional(),
  "filter[territory_id]": zod.coerce.number().int().optional(),
  /** Current city: open movement at a client with this locality. */
  "filter[locality_id]": zod.coerce.number().int().optional(),
  /** Current holder: open movement at this client party. */
  "filter[holder_party_id]": zod.coerce.number().int().optional(),
  "filter[packaging]": PackagingKind.optional(),
  /**
   * Rentable stock only: IN_STOCK_EMPTY/FULL, ownership OURS|SUPPLIER,
   * not a packed battery member, and no OPEN movement (not with a client).
   */
  "filter[available_for_rental]": zod
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type CylinderListQuery = zod.infer<typeof CylinderListQuery>;

export const CylinderListResponse = paginated(Cylinder);
export type CylinderListResponse = zod.infer<typeof CylinderListResponse>;

export const ReportCylinderLossInput = zod.object({
  outcome: zod.enum(["LOST", "BROKEN"]),
  client_party_id: zod.number().int().optional(),
  occurred_on: IsoDate,
  note: zod.string().nullable().optional(),
});
export type ReportCylinderLossInput = zod.infer<typeof ReportCylinderLossInput>;

export const AlertRecord = zod.object({
  id: zod.number().int(),
  alert_type: zod.string(),
  entity_table: zod.string().nullable(),
  entity_id: zod.number().int().nullable(),
  severity: zod.number().int(),
  created_at: zod.string().datetime(),
  resolved_at: zod.string().datetime().nullable(),
  assigned_role: zod.string().nullable(),
});
export type AlertRecord = zod.infer<typeof AlertRecord>;

export const ReportCylinderLossResponse = zod.object({
  cylinder: Cylinder,
  alert: AlertRecord.nullable(),
});
export type ReportCylinderLossResponse = zod.infer<
  typeof ReportCylinderLossResponse
>;

/** Source of a circulation timeline row (client movement vs supplier loan). */
export const CylinderHistoryEventSource = zod.enum([
  "MOVEMENT",
  "SUPPLIER_LOAN",
]);
export type CylinderHistoryEventSource = zod.infer<
  typeof CylinderHistoryEventSource
>;

/**
 * Kind shown on the cylinder ledger. Extends movement kinds with supplier-loan
 * loops so devoluciones al proveedor appear alongside client custody.
 */
export const CylinderHistoryKind = zod.enum([
  "RENTAL",
  "REFILL",
  "SUPPLIER_LOAN",
]);
export type CylinderHistoryKind = zod.infer<typeof CylinderHistoryKind>;

/** Circulation timeline row (GET /cylinders/{id}/history). */
export const CylinderHistoryRow = zod.object({
  event_source: CylinderHistoryEventSource,
  movement_id: zod.number().int().nullable(),
  loan_id: zod.number().int().nullable(),
  holder_party_id: zod.number().int(),
  holder_name: zod.string(),
  gas_code: GasCode.nullable(),
  movement_kind: CylinderHistoryKind,
  delivery_date: IsoDate,
  return_date: IsoDate.nullable(),
  rental_days: zod.number().int().nullable(),
  state: MovementState,
  note: zod.string().nullable(),
});
export type CylinderHistoryRow = zod.infer<typeof CylinderHistoryRow>;

export const CylinderHistoryQuery = PaginationQuery.extend({
  sort: zod.enum(["delivery_date", "-delivery_date"]).default("-delivery_date"),
  "filter[delivery_date][gte]": IsoDate.optional(),
  "filter[delivery_date][lte]": IsoDate.optional(),
  "filter[holder_party_id]": zod.coerce.number().int().optional(),
});
export type CylinderHistoryQuery = zod.infer<typeof CylinderHistoryQuery>;

export const CylinderHistoryResponse = zod.object({
  cylinder_id: zod.number().int(),
  data: zod.array(CylinderHistoryRow),
  page: PageMeta,
});
export type CylinderHistoryResponse = zod.infer<typeof CylinderHistoryResponse>;

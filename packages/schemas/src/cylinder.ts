import { z } from "zod";
import { IsoDate, PageMeta, paginated, PaginationQuery } from "./common";
import {
  CylinderCondition,
  CylinderState,
  GasCode,
  MovementState,
  OwnershipBasis,
  PackagingKind,
} from "./enums";

export const Cylinder = z.object({
  id: z.number().int(),
  owner_party_id: z.number().int(),
  owner_name: z.string().optional(),
  serial_number: z.string(),
  gas_code: GasCode.nullable(),
  capacity_m3: z.number().nullable(),
  ownership_basis: OwnershipBasis,
  packaging: PackagingKind,
  battery_id: z.number().int().nullable(),
  home_territory_id: z.number().int().nullable(),
  state: CylinderState,
  condition: CylinderCondition,
  acquisition_date: IsoDate.nullable(),
  version: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
  current_holder_party_id: z.number().int().nullable().optional(),
  current_holder_name: z.string().nullable().optional(),
  current_movement_id: z.number().int().nullable().optional(),
  /** Current city: client locality/territory when out, else home depot when in stock. */
  current_location_name: z.string().nullable().optional(),
});
export type Cylinder = z.infer<typeof Cylinder>;

export const CreateCylinderInput = z.object({
  owner_party_id: z.number().int(),
  serial_number: z.string().min(1),
  gas_code: GasCode.nullable().optional(),
  capacity_m3: z.coerce.number().positive().nullable().optional(),
  ownership_basis: OwnershipBasis,
  packaging: PackagingKind.default("SINGLE"),
  home_territory_id: z.number().int().nullable().optional(),
  acquisition_date: IsoDate.nullable().optional(),
  condition: CylinderCondition.default("EMPTY"),
});
export type CreateCylinderInput = z.infer<typeof CreateCylinderInput>;

export const CylinderListQuery = PaginationQuery.extend({
  q: z.string().optional(),
  sort: z
    .enum([
      "serial_number",
      "-serial_number",
      "updated_at",
      "-updated_at",
      "state",
      "-state",
    ])
    .default("serial_number"),
  "filter[state]": CylinderState.optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[owner_party_id]": z.coerce.number().int().optional(),
  "filter[ownership_basis]": OwnershipBasis.optional(),
  "filter[territory_id]": z.coerce.number().int().optional(),
  /** Current city: open movement at a client with this locality. */
  "filter[locality_id]": z.coerce.number().int().optional(),
  "filter[packaging]": PackagingKind.optional(),
  /**
   * Rentable stock only: IN_STOCK_EMPTY/FULL, ownership OURS|SUPPLIER,
   * not a packed battery member, and no OPEN movement (not with a client).
   */
  "filter[available_for_rental]": z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type CylinderListQuery = z.infer<typeof CylinderListQuery>;

export const CylinderListResponse = paginated(Cylinder);
export type CylinderListResponse = z.infer<typeof CylinderListResponse>;

export const ReportCylinderLossInput = z.object({
  outcome: z.enum(["LOST", "BROKEN"]),
  client_party_id: z.number().int().optional(),
  occurred_on: IsoDate,
  note: z.string().nullable().optional(),
});
export type ReportCylinderLossInput = z.infer<typeof ReportCylinderLossInput>;

export const AlertRecord = z.object({
  id: z.number().int(),
  alert_type: z.string(),
  entity_table: z.string().nullable(),
  entity_id: z.number().int().nullable(),
  severity: z.number().int(),
  created_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable(),
  assigned_role: z.string().nullable(),
});
export type AlertRecord = z.infer<typeof AlertRecord>;

export const ReportCylinderLossResponse = z.object({
  cylinder: Cylinder,
  alert: AlertRecord.nullable(),
});
export type ReportCylinderLossResponse = z.infer<
  typeof ReportCylinderLossResponse
>;

/** Source of a circulation timeline row (client movement vs supplier loan). */
export const CylinderHistoryEventSource = z.enum(["MOVEMENT", "SUPPLIER_LOAN"]);
export type CylinderHistoryEventSource = z.infer<
  typeof CylinderHistoryEventSource
>;

/**
 * Kind shown on the cylinder ledger. Extends movement kinds with supplier-loan
 * loops so devoluciones al proveedor appear alongside client custody.
 */
export const CylinderHistoryKind = z.enum([
  "RENTAL",
  "REFILL",
  "SUPPLIER_LOAN",
]);
export type CylinderHistoryKind = z.infer<typeof CylinderHistoryKind>;

/** Circulation timeline row (GET /cylinders/{id}/history). */
export const CylinderHistoryRow = z.object({
  event_source: CylinderHistoryEventSource,
  movement_id: z.number().int().nullable(),
  loan_id: z.number().int().nullable(),
  holder_party_id: z.number().int(),
  holder_name: z.string(),
  gas_code: GasCode.nullable(),
  movement_kind: CylinderHistoryKind,
  delivery_date: IsoDate,
  return_date: IsoDate.nullable(),
  rental_days: z.number().int().nullable(),
  state: MovementState,
  note: z.string().nullable(),
});
export type CylinderHistoryRow = z.infer<typeof CylinderHistoryRow>;

export const CylinderHistoryQuery = PaginationQuery.extend({
  sort: z.enum(["delivery_date", "-delivery_date"]).default("-delivery_date"),
  "filter[delivery_date][gte]": IsoDate.optional(),
  "filter[delivery_date][lte]": IsoDate.optional(),
  "filter[holder_party_id]": z.coerce.number().int().optional(),
});
export type CylinderHistoryQuery = z.infer<typeof CylinderHistoryQuery>;

export const CylinderHistoryResponse = z.object({
  cylinder_id: z.number().int(),
  data: z.array(CylinderHistoryRow),
  page: PageMeta,
});
export type CylinderHistoryResponse = z.infer<typeof CylinderHistoryResponse>;

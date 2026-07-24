import { z as zod } from "zod";

/**
 * Controlled vocabularies (BR-15). These MUST stay in lockstep with the
 * PostgreSQL ENUM types in schema.sql and the domain model (002).
 * Canonical codes are stored; the UI translates labels via the `enums`
 * i18n namespace (006 R7).
 */

export const GasCode = zod.enum([
  "O2",
  "O2_MED",
  "O2_LASER",
  "CO2",
  "N2",
  "AR",
  "AR_50",
  "ATAL",
  "MIX20",
  "MIX22",
  "MAPAX30",
  "ACET",
  "HELIUM",
  "THERMOLENE",
]);
export type GasCode = zod.infer<typeof GasCode>;

export const OwnershipBasis = zod.enum(["OURS", "SUPPLIER", "CUSTOMER"]);
export type OwnershipBasis = zod.infer<typeof OwnershipBasis>;

export const MovementKind = zod.enum(["RENTAL", "REFILL", "SALE"]);
export type MovementKind = zod.infer<typeof MovementKind>;

/** Remito paper kind: outbound delivery vs return document. */
export const DeliveryNoteKind = zod.enum(["DELIVERY", "RETURN"]);
export type DeliveryNoteKind = zod.infer<typeof DeliveryNoteKind>;

/** Full remito operational type (docs/specs/remitos.md §7). */
export const RemitoType = zod.enum([
  "DELIVERY",
  "CYLINDER_RETURN",
  "ACCESSORY_RETURN",
  "TRANSFER_WAREHOUSE",
  "INTERNAL_TRANSFER",
  "CUSTOMER_PICKUP",
  "ADJUSTMENT",
  "RENTAL_PICKUP",
  "RENTAL_DELIVERY",
]);
export type RemitoType = zod.infer<typeof RemitoType>;

/** Remito document lifecycle status (docs/specs/remitos.md §5). */
export const RemitoStatus = zod.enum([
  "DRAFT",
  "PREPARED",
  "ASSIGNED",
  "LOADED",
  "IN_TRANSIT",
  "DELIVERED",
  "SIGNED",
  "CLOSED",
  "INVOICED",
  "ARCHIVED",
  "CANCELLED",
]);
export type RemitoStatus = zod.infer<typeof RemitoStatus>;

export const RemitoPriority = zod.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type RemitoPriority = zod.infer<typeof RemitoPriority>;

export const PickingStatus = zod.enum([
  "PENDING",
  "PREPARING",
  "COMPLETE",
  "LOADED",
]);
export type PickingStatus = zod.infer<typeof PickingStatus>;

export const RemitoLineKind = zod.enum(["CYLINDER", "ACCESSORY", "BATTERY"]);
export type RemitoLineKind = zod.infer<typeof RemitoLineKind>;

export const IncidentType = zod.enum([
  "CUSTOMER_ABSENT",
  "CYLINDER_DAMAGED",
  "WRONG_QUANTITY",
  "LEAK",
  "WRONG_GAS",
  "WRONG_SERIAL",
  "DELIVERY_REJECTED",
  "LATE_DELIVERY",
  "OTHER",
]);
export type IncidentType = zod.infer<typeof IncidentType>;

export const IncidentSeverity = zod.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type IncidentSeverity = zod.infer<typeof IncidentSeverity>;

export const IncidentStatus = zod.enum([
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "DISMISSED",
]);
export type IncidentStatus = zod.infer<typeof IncidentStatus>;

/** Controlled remito PDF copy kinds (docs/specs/remitos.md §15.2). */
export const PrintCopyKind = zod.enum([
  "ORIGINAL",
  "DUPLICADO",
  "TRIPLICADO",
  "REIMPRESION",
]);
export type PrintCopyKind = zod.infer<typeof PrintCopyKind>;

export const MovementState = zod.enum([
  "OPEN",
  "CLOSED",
  "SWAPPED",
  "LOST",
  "SOLD",
  "VOID",
]);
export type MovementState = zod.infer<typeof MovementState>;

export const CylinderState = zod.enum([
  "IN_STOCK_EMPTY",
  "IN_STOCK_FULL",
  "AT_CLIENT",
  "AT_SUPPLIER",
  "SOLD",
  "LOST",
  "BROKEN",
  "RETURNED_TO_SUPPLIER",
  "RETIRED",
]);
export type CylinderState = zod.infer<typeof CylinderState>;

export const CylinderCondition = zod.enum(["EMPTY", "FULL"]);
export type CylinderCondition = zod.infer<typeof CylinderCondition>;

export const PackagingKind = zod.enum(["SINGLE", "BATTERY", "BATTERY_MEMBER"]);
export type PackagingKind = zod.infer<typeof PackagingKind>;

export const PartyType = zod.enum([
  "SELF",
  "SUPPLIER",
  "SUBDISTRIBUTOR",
  "CUSTOMER",
]);
export type PartyType = zod.infer<typeof PartyType>;

export const ClientCoverage = zod.enum(["PRIVATE", "MUNICIPAL_HOSPITAL"]);
export type ClientCoverage = zod.infer<typeof ClientCoverage>;

export const ClientStatus = zod.enum(["ACTIVE", "DORMANT", "INACTIVE"]);
export type ClientStatus = zod.infer<typeof ClientStatus>;

export const ClientSegment = zod.enum([
  "METALWORKING",
  "AGRO",
  "TRANSPORT",
  "BEVERAGE",
  "FOOD_PROCESSING",
  "LASER_CUTTING",
  "MEDICAL_HOMECARE",
  "PUBLIC_SECTOR",
  "RESELLER",
  "OTHER",
]);
export type ClientSegment = zod.infer<typeof ClientSegment>;

/** RBAC roles (005 R2). CLIENT exists but is not granted in v1 (D-1). */
export const RoleCode = zod.enum([
  "CLERK",
  "DRIVER",
  "PLANT",
  "INVENTORY",
  "BILLING",
  "MANAGER",
  "SUBDIST",
  "ADMIN",
  "MEDICAL",
  "CLIENT",
]);
export type RoleCode = zod.infer<typeof RoleCode>;

export const RatePeriod = zod.enum(["DAILY", "MONTHLY"]);
export type RatePeriod = zod.infer<typeof RatePeriod>;

export const InvoiceStatus = zod.enum([
  "DRAFT",
  "APPROVED",
  "EXPORTED",
  "CANCELLED",
]);
export type InvoiceStatus = zod.infer<typeof InvoiceStatus>;

/** Supplier loan loop stages (BR-11 / W14). */
export const LoanStage = zod.enum([
  "RECEIVED",
  "OUT_TO_CLIENT",
  "BACK_FROM_CLIENT",
  "RETURNED_TO_SUPPLIER",
]);
export type LoanStage = zod.infer<typeof LoanStage>;

export const AccessoryType = zod.enum([
  "REGULATOR",
  "ADAPTER",
  "PORTABLE_O2_BACKPACK",
]);
export type AccessoryType = zod.infer<typeof AccessoryType>;

export const AccessoryState = zod.enum([
  "IN_STOCK",
  "ON_LOAN",
  "IN_REPAIR",
  "LOST",
  "BROKEN",
  "RETIRED",
]);
export type AccessoryState = zod.infer<typeof AccessoryState>;

export const AccessoryRentalState = zod.enum(["ON_LOAN", "RETURNED", "LOST"]);
export type AccessoryRentalState = zod.infer<typeof AccessoryRentalState>;

export const ChargeBasis = zod.enum(["RENTAL", "FREE_LOAN"]);
export type ChargeBasis = zod.infer<typeof ChargeBasis>;

/** Immutable audit trail action (003 / schema.sql `audit_action`). */
export const AuditAction = zod.enum(["INSERT", "UPDATE", "DELETE", "VOID"]);
export type AuditAction = zod.infer<typeof AuditAction>;

/** Cylinder capacity unit (D-18). Magnitude lives in capacity_m3 (legacy name). */
export const CapacityUnit = zod.enum(["M3", "KG"]);
export type CapacityUnit = zod.infer<typeof CapacityUnit>;

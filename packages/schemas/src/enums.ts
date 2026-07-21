import { z } from "zod";

/**
 * Controlled vocabularies (BR-15). These MUST stay in lockstep with the
 * PostgreSQL ENUM types in schema.sql and the domain model (002).
 * Canonical codes are stored; the UI translates labels via the `enums`
 * i18n namespace (006 R7).
 */

export const GasCode = z.enum([
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
export type GasCode = z.infer<typeof GasCode>;

export const OwnershipBasis = z.enum(["OURS", "SUPPLIER", "CUSTOMER"]);
export type OwnershipBasis = z.infer<typeof OwnershipBasis>;

export const MovementKind = z.enum(["RENTAL", "REFILL"]);
export type MovementKind = z.infer<typeof MovementKind>;

export const MovementState = z.enum([
  "OPEN",
  "CLOSED",
  "SWAPPED",
  "LOST",
  "SOLD",
  "VOID",
]);
export type MovementState = z.infer<typeof MovementState>;

export const CylinderState = z.enum([
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
export type CylinderState = z.infer<typeof CylinderState>;

export const CylinderCondition = z.enum(["EMPTY", "FULL"]);
export type CylinderCondition = z.infer<typeof CylinderCondition>;

export const PackagingKind = z.enum(["SINGLE", "BATTERY", "BATTERY_MEMBER"]);
export type PackagingKind = z.infer<typeof PackagingKind>;

export const PartyType = z.enum([
  "SELF",
  "SUPPLIER",
  "SUBDISTRIBUTOR",
  "CUSTOMER",
]);
export type PartyType = z.infer<typeof PartyType>;

export const ClientCoverage = z.enum(["PRIVATE", "MUNICIPAL_HOSPITAL"]);
export type ClientCoverage = z.infer<typeof ClientCoverage>;

export const ClientStatus = z.enum(["ACTIVE", "DORMANT", "INACTIVE"]);
export type ClientStatus = z.infer<typeof ClientStatus>;

export const ClientSegment = z.enum([
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
export type ClientSegment = z.infer<typeof ClientSegment>;

/** RBAC roles (005 R2). CLIENT exists but is not granted in v1 (D-1). */
export const RoleCode = z.enum([
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
export type RoleCode = z.infer<typeof RoleCode>;

export const RatePeriod = z.enum(["DAILY", "MONTHLY"]);
export type RatePeriod = z.infer<typeof RatePeriod>;

export const InvoiceStatus = z.enum([
  "DRAFT",
  "APPROVED",
  "EXPORTED",
  "CANCELLED",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

/** Supplier loan loop stages (BR-11 / W14). */
export const LoanStage = z.enum([
  "RECEIVED",
  "OUT_TO_CLIENT",
  "BACK_FROM_CLIENT",
  "RETURNED_TO_SUPPLIER",
]);
export type LoanStage = z.infer<typeof LoanStage>;

export const AccessoryType = z.enum([
  "REGULATOR",
  "ADAPTER",
  "PORTABLE_O2_BACKPACK",
]);
export type AccessoryType = z.infer<typeof AccessoryType>;

export const AccessoryState = z.enum([
  "IN_STOCK",
  "ON_LOAN",
  "IN_REPAIR",
  "LOST",
  "BROKEN",
  "RETIRED",
]);
export type AccessoryState = z.infer<typeof AccessoryState>;

export const AccessoryRentalState = z.enum(["ON_LOAN", "RETURNED", "LOST"]);
export type AccessoryRentalState = z.infer<typeof AccessoryRentalState>;

export const ChargeBasis = z.enum(["RENTAL", "FREE_LOAN"]);
export type ChargeBasis = z.infer<typeof ChargeBasis>;

/** Immutable audit trail action (003 / schema.sql `audit_action`). */
export const AuditAction = z.enum(["INSERT", "UPDATE", "DELETE", "VOID"]);
export type AuditAction = z.infer<typeof AuditAction>;

import type { Generated } from "kysely";

/** PostgreSQL enum mirrors — keep in lockstep with schema.sql. */
export type PartyType = "SELF" | "SUPPLIER" | "SUBDISTRIBUTOR" | "CUSTOMER";
export type ClientCoverage = "PRIVATE" | "MUNICIPAL_HOSPITAL";
export type ClientStatus = "ACTIVE" | "DORMANT" | "INACTIVE";
export type ClientSegment =
  | "METALWORKING"
  | "AGRO"
  | "TRANSPORT"
  | "BEVERAGE"
  | "FOOD_PROCESSING"
  | "LASER_CUTTING"
  | "MEDICAL_HOMECARE"
  | "PUBLIC_SECTOR"
  | "RESELLER"
  | "OTHER";
export type OwnershipBasis = "OURS" | "SUPPLIER" | "CUSTOMER";
export type CylinderState =
  | "IN_STOCK_EMPTY"
  | "IN_STOCK_FULL"
  | "AT_CLIENT"
  | "AT_SUPPLIER"
  | "SOLD"
  | "LOST"
  | "BROKEN"
  | "RETURNED_TO_SUPPLIER"
  | "RETIRED";
export type CylinderCondition = "EMPTY" | "FULL";
export type PackagingKind = "SINGLE" | "BATTERY" | "BATTERY_MEMBER";
export type MovementKind = "RENTAL" | "REFILL" | "SALE";
export type MovementState =
  "OPEN" | "CLOSED" | "SWAPPED" | "LOST" | "SOLD" | "VOID";
export type DeliveryNoteKind = "DELIVERY" | "RETURN";
export type RemitoStatus =
  | "DRAFT"
  | "PREPARED"
  | "ASSIGNED"
  | "LOADED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "SIGNED"
  | "CLOSED"
  | "INVOICED"
  | "ARCHIVED"
  | "CANCELLED";
export type RemitoType =
  | "DELIVERY"
  | "CYLINDER_RETURN"
  | "ACCESSORY_RETURN"
  | "TRANSFER_WAREHOUSE"
  | "INTERNAL_TRANSFER"
  | "CUSTOMER_PICKUP"
  | "ADJUSTMENT"
  | "RENTAL_PICKUP"
  | "RENTAL_DELIVERY";
export type RemitoPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type PickingStatus = "PENDING" | "PREPARING" | "COMPLETE" | "LOADED";
export type RemitoLineKind = "CYLINDER" | "ACCESSORY" | "BATTERY";
export type IncidentType =
  | "CUSTOMER_ABSENT"
  | "CYLINDER_DAMAGED"
  | "WRONG_QUANTITY"
  | "LEAK"
  | "WRONG_GAS"
  | "WRONG_SERIAL"
  | "DELIVERY_REJECTED"
  | "LATE_DELIVERY"
  | "OTHER";
export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
export type PrintCopyKind =
  "ORIGINAL" | "DUPLICADO" | "TRIPLICADO" | "REIMPRESION";
export type RatePeriod = "DAILY" | "MONTHLY";
export type InvoiceStatus = "DRAFT" | "APPROVED" | "EXPORTED" | "CANCELLED";
export type LoanStage =
  "RECEIVED" | "OUT_TO_CLIENT" | "BACK_FROM_CLIENT" | "RETURNED_TO_SUPPLIER";

export type AccessoryType = "REGULATOR" | "ADAPTER" | "PORTABLE_O2_BACKPACK";
export type AccessoryState =
  "IN_STOCK" | "ON_LOAN" | "IN_REPAIR" | "LOST" | "BROKEN" | "RETIRED";
export type AccessoryRentalState = "ON_LOAN" | "RETURNED" | "LOST";
export type ChargeBasis = "RENTAL" | "FREE_LOAN";
export type CapacityUnit = "M3" | "KG";
export type ArcaEnvironment = "HOMOLOGATION" | "PRODUCTION";

export interface ArcaCredentialsTable {
  id: Generated<number>;
  company_id: number;
  environment: ArcaEnvironment;
  cuit: string;
  certificate_encrypted: string | null;
  private_key_encrypted: string | null;
  csr_pem: string | null;
  certificate_fingerprint: string | null;
  valid_until: Date | null;
  last_validation: Date | null;
  last_authentication: Date | null;
  last_connection_status: string | null;
  last_connection_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
  created_by: number | null;
  updated_by: number | null;
  deleted_at: Date | null;
}

export interface AppUserTable {
  id: Generated<number>;
  username: string;
  email: string | null;
  password_hash: string;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login_at: Date | null;
  party_id: number | null;
  mfa_secret: string | null;
  mfa_enrolled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface RoleTable {
  id: Generated<number>;
  code: string;
  name: string;
}

export interface UserRoleTable {
  user_id: number;
  role_id: number;
}

export interface UserTerritoryScopeTable {
  user_id: number;
  territory_id: number;
}

export interface RefreshTokenTable {
  id: Generated<number>;
  user_id: number;
  token_hash: string;
  issued_at: Generated<Date>;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
  ip: string | null;
}

export interface DispatchTerritoryTable {
  id: Generated<number>;
  name: string;
  is_active: boolean;
}

export interface LocalityTable {
  id: Generated<number>;
  name: string;
  province: string;
  territory_id: number | null;
}

export interface PartyTable {
  id: Generated<number>;
  party_type: PartyType;
  display_name: string;
  is_self: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  created_by: number | null;
  updated_by: number | null;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface ClientTable {
  party_id: number;
  legal_name: string | null;
  cuit: string | null;
  cuit_valid: boolean;
  address_street: string | null;
  locality_id: number | null;
  territory_id: number | null;
  coverage: ClientCoverage;
  segment: ClientSegment | null;
  delivery_instructions: string | null;
  daily_rate_default: string | null;
  status: ClientStatus;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  created_by: number | null;
  updated_by: number | null;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface ClientContactTable {
  id: Generated<number>;
  client_party_id: number;
  name: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
}

export interface GasTypeTable {
  code: string;
  name: string;
  family: string | null;
  purity: string | null;
  is_medical: boolean;
  is_active: boolean;
}

export interface CylinderTable {
  id: Generated<number>;
  owner_party_id: number;
  serial_number: string;
  gas_code: string | null;
  capacity_m3: string | null;
  capacity_unit: CapacityUnit;
  ownership_basis: OwnershipBasis;
  packaging: PackagingKind;
  battery_id: number | null;
  home_territory_id: number | null;
  state: CylinderState;
  condition: CylinderCondition;
  acquisition_date: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  created_by: number | null;
  updated_by: number | null;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface MovementEventTable {
  id: Generated<number>;
  request_id: Generated<string>;
  cylinder_id: number;
  holder_party_id: number;
  movement_kind: MovementKind;
  property_basis: OwnershipBasis;
  gas_code: string | null;
  delivery_date: string;
  return_date: string | null;
  rental_days: Generated<number | null>;
  origin_party_id: number | null;
  swap_with_cyl_id: number | null;
  remito_id: number | null;
  state: MovementState;
  note: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  created_by: number | null;
  updated_by: number | null;
  version: Generated<number>;
}

export interface AlertTable {
  id: Generated<number>;
  alert_type: string;
  entity_table: string | null;
  entity_id: number | null;
  severity: number;
  created_at: Generated<Date>;
  resolved_at: Date | null;
  assigned_role: string | null;
  contact_note: string | null;
  last_contacted_at: Date | null;
}

export interface CylinderBatteryTable {
  id: Generated<number>;
  battery_code: string;
  owner_party_id: number;
  gas_code: string | null;
  member_count: number | null;
  state: CylinderState;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  created_by: number | null;
  updated_by: number | null;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface BatteryMemberTable {
  battery_id: number;
  cylinder_id: number;
  added_at: Generated<Date>;
  removed_at: Date | null;
}

export interface RentalRateTable {
  id: Generated<number>;
  client_party_id: number | null;
  gas_code: string | null;
  /** Null = any cylinder size. Magnitude is in capacity_unit (D-18). */
  capacity_m3: string | null;
  capacity_unit: CapacityUnit;
  period: RatePeriod;
  amount: string;
  effective_from: string;
  effective_to: string | null;
}

export interface RefillRateTable {
  id: Generated<number>;
  client_party_id: number | null;
  gas_code: string | null;
  /** Null = any cylinder size. Magnitude is in capacity_unit (D-18). */
  capacity_m3: string | null;
  capacity_unit: CapacityUnit;
  amount: string;
  effective_from: string;
  effective_to: string | null;
}

export interface BillingRunTable {
  id: Generated<number>;
  period_start: string;
  period_end: string;
  client_party_id: number | null;
  status: InvoiceStatus;
  created_at: Generated<Date>;
  created_by: number | null;
}

export interface InvoiceTable {
  id: Generated<number>;
  client_party_id: number;
  period_start: string;
  period_end: string;
  status: InvoiceStatus;
  total: string;
  billing_run_id: number | null;
  cae: string | null;
  cae_due_date: string | null;
  cbte_tipo: number | null;
  pto_vta: number | null;
  cbte_nro: number | null;
  cbte_fch: string | null;
  doc_tipo: number | null;
  doc_nro: number | null;
  condicion_iva_receptor: number | null;
  imp_neto: string | null;
  imp_iva: string | null;
  imp_total: string | null;
  arca_environment: string | null;
  arca_qr_url: string | null;
  authorized_at: Date | null;
  authorized_by: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export interface ChargeLineTable {
  id: Generated<number>;
  invoice_id: number;
  source_table: string;
  source_id: number;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  amount: string;
}

export interface SupplierLoanCycleTable {
  id: Generated<number>;
  cylinder_id: number;
  supplier_party_id: number;
  client_party_id: number | null;
  gas_code: string | null;
  received_from_supplier: string | null;
  delivered_to_client: string | null;
  returned_by_client: string | null;
  returned_to_supplier: string | null;
  stage: LoanStage;
  version: Generated<number>;
}

export interface StockTransferTable {
  id: Generated<number>;
  cylinder_id: number;
  from_party_id: number;
  to_party_id: number;
  transfer_date: string;
  return_date: string | null;
  note: string | null;
  created_at: Generated<Date>;
  created_by: number | null;
}

export interface AccessoryTable {
  id: Generated<number>;
  accessory_type: AccessoryType;
  identifier: string | null;
  owner_party_id: number;
  state: AccessoryState;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  created_by: number | null;
  updated_by: number | null;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface AccessoryRentalTable {
  id: Generated<number>;
  accessory_id: number;
  client_party_id: number;
  quantity: number;
  start_date: string;
  end_date: string | null;
  charge_basis: ChargeBasis;
  remito_id: number | null;
  state: AccessoryRentalState;
  note: string | null;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export interface CylinderSaleTable {
  id: Generated<number>;
  cylinder_id: number;
  client_party_id: number | null;
  sale_date: string;
  gas_code: string | null;
  capacity_m3: string | number | null;
  capacity_unit: CapacityUnit;
  price: string | number | null;
  address_snapshot: string | null;
  locality_snapshot: string | null;
  phone_snapshot: string | null;
  note: string | null;
  created_at: Generated<Date>;
  created_by: number | null;
  version: Generated<number>;
}

export interface DeliveryNoteTable {
  id: Generated<number>;
  remito_number: string;
  series_id: number | null;
  kind: DeliveryNoteKind;
  remito_type: RemitoType;
  status: RemitoStatus;
  picking_status: PickingStatus;
  priority: RemitoPriority;
  issued_date: string | null;
  scheduled_delivery_at: Date | string | null;
  departure_at: Date | string | null;
  arrival_at: Date | string | null;
  closed_at: Date | string | null;
  client_party_id: number | null;
  origin_warehouse_id: number | null;
  destination_warehouse_id: number | null;
  driver_id: number | null;
  helper_id: number | null;
  vehicle_id: number | null;
  observations: string | null;
  cancel_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
  deleted_at: Date | null;
}

export interface RemitoStatusHistoryTable {
  id: Generated<number>;
  remito_id: number;
  from_status: RemitoStatus | null;
  to_status: RemitoStatus;
  actor_user_id: number | null;
  note: string | null;
  at: Generated<Date>;
}

export interface WarehouseTable {
  id: Generated<number>;
  code: string;
  name: string;
  territory_id: number | null;
  address: string | null;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface VehicleTable {
  id: Generated<number>;
  plate: string;
  name: string | null;
  capacity_units: number | null;
  capacity_weight: string | number | null;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface DriverProfileTable {
  id: Generated<number>;
  user_id: number | null;
  display_name: string;
  phone: string | null;
  license_no: string | null;
  license_expiry: string | null;
  default_vehicle_id: number | null;
  is_helper_eligible: boolean;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface RemitoSeriesTable {
  id: Generated<number>;
  code: string;
  emission_point_label: string | null;
  pad_width: number;
  next_number: number;
  is_active: boolean;
  created_at: Generated<Date>;
}

export interface RemitoLineTable {
  id: Generated<number>;
  remito_id: number;
  line_no: number;
  item_kind: RemitoLineKind;
  cylinder_id: number | null;
  battery_id: number | null;
  accessory_id: number | null;
  serial_number: string | null;
  gas_code: string | null;
  capacity_value: string | number | null;
  capacity_unit: CapacityUnit | null;
  owner_party_id: number | null;
  is_rental: boolean;
  ownership_basis: OwnershipBasis | null;
  qty: string | number;
  picked_qty: string | number;
  delivered_qty: string | number | null;
  returned_qty: string | number | null;
  unit: string | null;
  pressure: string | number | null;
  condition: CylinderCondition | null;
  barcode: string | null;
  qr_code: string | null;
  movement_event_id: number | null;
  accessory_rental_id: number | null;
  weight_kg: string | number | null;
  notes: string | null;
  scanned_at: Date | string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface RemitoIncidentTable {
  id: Generated<number>;
  remito_id: number;
  line_id: number | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  description: string;
  reported_by: number | null;
  reported_at: Generated<Date>;
  resolution: string | null;
  resolved_by: number | null;
  resolved_at: Date | string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface RemitoPrintLogTable {
  id: Generated<number>;
  remito_id: number;
  copy_kind: PrintCopyKind;
  reprint_seq: number | null;
  reason: string | null;
  printed_by: number | null;
  printed_at: Generated<Date>;
  pdf_object_ref: string | null;
  content_version: number | null;
}

export interface MigrationExceptionTable {
  id: Generated<number>;
  workbook: string;
  sheet: string | null;
  row_ref: string | null;
  raw: unknown;
  reason: string;
  status: "OPEN" | "RESOLVED" | "IGNORED";
  created_at: Generated<Date>;
}

export interface SystemSettingTable {
  key: string;
  value: string;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export type AuditActionDb = "INSERT" | "UPDATE" | "DELETE" | "VOID";

export interface AuditLogTable {
  id: Generated<number>;
  occurred_at: Generated<Date>;
  actor_user_id: number | null;
  actor_role: string | null;
  action: AuditActionDb;
  entity_table: string;
  entity_id: number | null;
  before: unknown | null;
  after: unknown | null;
  request_id: string | null;
  source: string | null;
}

export interface Database {
  app_user: AppUserTable;
  role: RoleTable;
  user_role: UserRoleTable;
  user_territory_scope: UserTerritoryScopeTable;
  refresh_token: RefreshTokenTable;
  dispatch_territory: DispatchTerritoryTable;
  locality: LocalityTable;
  party: PartyTable;
  client: ClientTable;
  client_contact: ClientContactTable;
  gas_type: GasTypeTable;
  cylinder: CylinderTable;
  movement_event: MovementEventTable;
  alert: AlertTable;
  cylinder_battery: CylinderBatteryTable;
  battery_member: BatteryMemberTable;
  rental_rate: RentalRateTable;
  refill_rate: RefillRateTable;
  billing_run: BillingRunTable;
  invoice: InvoiceTable;
  charge_line: ChargeLineTable;
  supplier_loan_cycle: SupplierLoanCycleTable;
  stock_transfer: StockTransferTable;
  accessory: AccessoryTable;
  accessory_rental: AccessoryRentalTable;
  cylinder_sale: CylinderSaleTable;
  delivery_note: DeliveryNoteTable;
  remito_status_history: RemitoStatusHistoryTable;
  warehouse: WarehouseTable;
  vehicle: VehicleTable;
  driver_profile: DriverProfileTable;
  remito_series: RemitoSeriesTable;
  remito_line: RemitoLineTable;
  remito_incident: RemitoIncidentTable;
  remito_print_log: RemitoPrintLogTable;
  migration_exception: MigrationExceptionTable;
  system_setting: SystemSettingTable;
  arca_credentials: ArcaCredentialsTable;
  audit_log: AuditLogTable;
}

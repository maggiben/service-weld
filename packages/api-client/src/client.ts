import type {
  AddBatteryMemberInput,
  Battery,
  BatteryListQuery,
  BatteryListResponse,
  BillingExportPayload,
  BillingRunDetail,
  Client,
  ClientAccountQuery,
  ClientAccountResponse,
  ClientListQuery,
  ClientListResponse,
  CreateBatteryInput,
  CreateBillingRunInput,
  CreateClientInput,
  UpdateClientInput,
  CreateCylinderInput,
  UpdateCylinderInput,
  CreateMovementInput,
  BackfillRentalRatesInput,
  BackfillRentalRatesResult,
  BackfillRefillRatesInput,
  BackfillRefillRatesResult,
  CreateRentalRateInput,
  UpdateRentalRateInput,
  CreateRefillRateInput,
  UpdateRefillRateInput,
  Cylinder,
  CylinderHistoryQuery,
  CylinderHistoryResponse,
  CylinderListQuery,
  CylinderListResponse,
  MovementEvent,
  MovementListQuery,
  MovementListResponse,
  RentalRate,
  RentalRateListQuery,
  RentalRateListResponse,
  RefillRate,
  RefillRateListQuery,
  RefillRateListResponse,
  ReplaceCylinderInput,
  ReplaceCylinderResponse,
  ReportCylinderLossInput,
  ReportCylinderLossResponse,
  ReturnMovementInput,
  RoleCode,
  StockTransfer,
  StockTransferListQuery,
  StockTransferListResponse,
  CreateStockTransferInput,
  CloseStockTransferInput,
  DeliveryNote,
  DeliveryNoteDetail,
  DeliveryNoteListQuery,
  DeliveryNoteListResponse,
  CreateDeliveryNoteInput,
  SupplierLoan,
  SupplierLoanListQuery,
  SupplierLoanListResponse,
  CreateSupplierLoanInput,
  AdvanceSupplierLoanInput,
  SwapMovementInput,
  VoidMovementInput,
  OutstandingListQuery,
  OutstandingListResponse,
  PhysicalCountInput,
  PhysicalCountResult,
  Accessory,
  AccessoryListQuery,
  AccessoryListResponse,
  CreateAccessoryInput,
  UpdateAccessoryInput,
  AccessoryRental,
  AccessoryRentalListQuery,
  AccessoryRentalListResponse,
  CreateAccessoryRentalInput,
  ReturnAccessoryRentalInput,
  Alert,
  AlertListQuery,
  AlertListResponse,
  AlertSummary,
  RefreshAlertsResult,
  UpdateAlertContact,
  FleetQuery,
  FleetReportResponse,
  FloatAgingQuery,
  FloatAgingReportResponse,
  RentalReportQuery,
  RentalReportResponse,
  RefillReportQuery,
  RefillReportResponse,
  LossReportQuery,
  LossReportResponse,
  SupplierReturnsQuery,
  SupplierReturnsReportResponse,
  CylinderLifeQuery,
  CylinderLifeReportResponse,
  DataQualityQuery,
  DataQualityReportResponse,
  MedicalStatementQuery,
  MedicalStatementReportResponse,
  Territory,
  TerritoryListQuery,
  TerritoryListResponse,
  CreateTerritoryInput,
  Locality,
  LocalityListQuery,
  LocalityListResponse,
  CreateLocalityInput,
  SystemSettings,
  UpdateSystemSettingsInput,
  AdminUser,
  AdminUserListQuery,
  AdminUserListResponse,
  CreateAdminUserInput,
  UpdateAdminUserInput,
  AuditLogListQuery,
  AuditLogListResponse,
  MigrationDataStatus,
  MigrationExportDataset,
  MigrationJobAccepted,
  MigrationMarkGoodRequest,
  MigrationPurgeBusinessRequest,
  MigrationPurgeBusinessResult,
  MigrationRollbackRequest,
  MigrationRunRequest,
  MigrationSnapshot,
  MigrationUploadedFile,
  MigrationWorkbookSlot,
} from "@weld/schemas";
import { ErrorEnvelope } from "@weld/schemas";
import { ApiClientError } from "./errors";

export interface TerritoryScope {
  id: number;
  name: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  roles: RoleCode[];
  territories: string[];
}

export interface MeResponse {
  id: number;
  username: string;
  roles: RoleCode[];
  territories: string[];
  territory_scopes: TerritoryScope[];
  capabilities: string[];
}

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh: string): void;
  clearTokens(): void;
}

export interface WeldApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  /** Optional fetch override (tests). */
  fetch?: typeof fetch;
}

type QueryValue = string | number | boolean | undefined | null;

function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Thin typed HTTP client for the walking-skeleton endpoints.
 * Will be replaced/augmented by OpenAPI codegen (D-10) once the surface stabilizes.
 */
export class WeldApiClient {
  private readonly baseUrl: string;
  private readonly tokens: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private refreshPromise: Promise<LoginResponse> | null = null;

  constructor(options: WeldApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.tokens = options.tokens;
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
  }

  async login(
    username: string,
    password: string,
    otp?: string,
  ): Promise<LoginResponse> {
    const body: Record<string, string> = { username, password };
    if (otp) body.otp = otp;
    const result = await this.request<LoginResponse>("POST", "/auth/login", {
      body,
      auth: false,
    });
    this.tokens.setTokens(result.access_token, result.refresh_token);
    return result;
  }

  async refresh(): Promise<LoginResponse> {
    const refresh = this.tokens.getRefreshToken();
    if (!refresh) {
      throw new ApiClientError("UNAUTHENTICATED", "No refresh token", 401);
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.request<LoginResponse>(
        "POST",
        "/auth/refresh",
        {
          body: { refresh_token: refresh },
          auth: false,
        },
      )
        .then((result) => {
          this.tokens.setTokens(result.access_token, result.refresh_token);
          return result;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  async logout(): Promise<void> {
    const refresh = this.tokens.getRefreshToken();
    try {
      if (refresh) {
        await this.request<void>("POST", "/auth/logout", {
          body: { refresh_token: refresh },
        });
      }
    } finally {
      this.tokens.clearTokens();
    }
  }

  me(): Promise<MeResponse> {
    return this.request<MeResponse>("GET", "/auth/me");
  }

  listClients(
    query: Partial<ClientListQuery> & Record<string, QueryValue> = {},
  ): Promise<ClientListResponse> {
    return this.request<ClientListResponse>(
      "GET",
      `/clients${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  getClient(id: number): Promise<Client> {
    return this.request<Client>("GET", `/clients/${id}`);
  }

  getClientAccount(
    id: number,
    query: Partial<ClientAccountQuery> & Record<string, QueryValue> = {},
  ): Promise<ClientAccountResponse> {
    return this.request<ClientAccountResponse>(
      "GET",
      `/clients/${id}/account${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  createClient(
    input: CreateClientInput,
    options?: { idempotencyKey?: string; force?: boolean },
  ): Promise<Client> {
    const qs = options?.force ? "?force=true" : "";
    return this.request<Client>("POST", `/clients${qs}`, {
      body: input,
      headers: options?.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    });
  }

  updateClient(
    id: number,
    input: UpdateClientInput,
    options?: { ifMatch?: number },
  ): Promise<Client> {
    return this.request<Client>("PATCH", `/clients/${id}`, {
      body: input,
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  deleteClient(id: number, options?: { ifMatch?: number }): Promise<void> {
    return this.request<void>("DELETE", `/clients/${id}`, {
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  listCylinders(
    query: Partial<CylinderListQuery> & Record<string, QueryValue> = {},
  ): Promise<CylinderListResponse> {
    return this.request<CylinderListResponse>(
      "GET",
      `/cylinders${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  getCylinder(id: number): Promise<Cylinder> {
    return this.request<Cylinder>("GET", `/cylinders/${id}`);
  }

  getCylinderHistory(
    id: number,
    query: Partial<CylinderHistoryQuery> & Record<string, QueryValue> = {},
  ): Promise<CylinderHistoryResponse> {
    return this.request<CylinderHistoryResponse>(
      "GET",
      `/cylinders/${id}/history${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  createCylinder(
    input: CreateCylinderInput,
    options?: { idempotencyKey?: string },
  ): Promise<Cylinder> {
    return this.request<Cylinder>("POST", "/cylinders", {
      body: input,
      headers: options?.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    });
  }

  updateCylinder(
    id: number,
    input: UpdateCylinderInput,
    options?: { ifMatch?: number },
  ): Promise<Cylinder> {
    return this.request<Cylinder>("PATCH", `/cylinders/${id}`, {
      body: input,
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  fillCylinder(id: number, options?: { ifMatch?: number }): Promise<Cylinder> {
    return this.request<Cylinder>("POST", `/cylinders/${id}/fill`, {
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  emptyCylinder(id: number, options?: { ifMatch?: number }): Promise<Cylinder> {
    return this.request<Cylinder>("POST", `/cylinders/${id}/empty`, {
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  listMovements(
    query: Partial<MovementListQuery> & Record<string, QueryValue> = {},
  ): Promise<MovementListResponse> {
    return this.request<MovementListResponse>(
      "GET",
      `/movements${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  getMovement(id: number): Promise<MovementEvent> {
    return this.request<MovementEvent>("GET", `/movements/${id}`);
  }

  createMovement(
    input: CreateMovementInput,
    options?: { idempotencyKey?: string },
  ): Promise<MovementEvent> {
    return this.request<MovementEvent>("POST", "/movements", {
      body: input,
      headers: options?.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined,
    });
  }

  returnMovement(
    id: number,
    input: ReturnMovementInput,
    options?: { ifMatch?: number },
  ): Promise<MovementEvent> {
    return this.request<MovementEvent>("PATCH", `/movements/${id}/return`, {
      body: input,
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  swapMovement(
    id: number,
    input: SwapMovementInput,
    options?: { ifMatch?: number },
  ): Promise<MovementEvent> {
    return this.request<MovementEvent>("PATCH", `/movements/${id}/swap`, {
      body: input,
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  voidMovement(
    id: number,
    input: VoidMovementInput,
    options?: { ifMatch?: number },
  ): Promise<MovementEvent> {
    return this.request<MovementEvent>("POST", `/movements/${id}/void`, {
      body: input,
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  reportCylinderLoss(
    id: number,
    input: ReportCylinderLossInput,
    options?: { ifMatch?: number },
  ): Promise<ReportCylinderLossResponse> {
    return this.request<ReportCylinderLossResponse>(
      "POST",
      `/cylinders/${id}/loss`,
      {
        body: input,
        headers:
          options?.ifMatch != null
            ? { "If-Match": String(options.ifMatch) }
            : undefined,
      },
    );
  }

  replaceCylinder(
    id: number,
    input: ReplaceCylinderInput,
    options?: { ifMatch?: number },
  ): Promise<ReplaceCylinderResponse> {
    return this.request<ReplaceCylinderResponse>(
      "POST",
      `/cylinders/${id}/replace`,
      {
        body: input,
        headers:
          options?.ifMatch != null
            ? { "If-Match": String(options.ifMatch) }
            : undefined,
      },
    );
  }

  listBatteries(
    query: Partial<BatteryListQuery> & Record<string, QueryValue> = {},
  ): Promise<BatteryListResponse> {
    return this.request<BatteryListResponse>(
      "GET",
      `/batteries${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  getBattery(id: number): Promise<Battery> {
    return this.request<Battery>("GET", `/batteries/${id}`);
  }

  createBattery(input: CreateBatteryInput): Promise<Battery> {
    return this.request<Battery>("POST", "/batteries", { body: input });
  }

  addBatteryMember(
    batteryId: number,
    input: AddBatteryMemberInput,
  ): Promise<Battery> {
    return this.request<Battery>("POST", `/batteries/${batteryId}/members`, {
      body: input,
    });
  }

  removeBatteryMember(batteryId: number, cylinderId: number): Promise<Battery> {
    return this.request<Battery>(
      "DELETE",
      `/batteries/${batteryId}/members/${cylinderId}`,
    );
  }

  fillBattery(id: number, options?: { ifMatch?: number }): Promise<Battery> {
    return this.request<Battery>("POST", `/batteries/${id}/fill`, {
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  emptyBattery(id: number, options?: { ifMatch?: number }): Promise<Battery> {
    return this.request<Battery>("POST", `/batteries/${id}/empty`, {
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  listSupplierLoans(
    query: Partial<SupplierLoanListQuery> & Record<string, QueryValue> = {},
  ): Promise<SupplierLoanListResponse> {
    return this.request<SupplierLoanListResponse>(
      "GET",
      `/supplier-loans${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  getSupplierLoan(id: number): Promise<SupplierLoan> {
    return this.request<SupplierLoan>("GET", `/supplier-loans/${id}`);
  }

  createSupplierLoan(input: CreateSupplierLoanInput): Promise<SupplierLoan> {
    return this.request<SupplierLoan>("POST", "/supplier-loans", {
      body: input,
    });
  }

  advanceSupplierLoan(
    id: number,
    input: AdvanceSupplierLoanInput,
    options?: { ifMatch?: number },
  ): Promise<SupplierLoan> {
    return this.request<SupplierLoan>(
      "PATCH",
      `/supplier-loans/${id}/advance`,
      {
        body: input,
        headers:
          options?.ifMatch != null
            ? { "If-Match": String(options.ifMatch) }
            : undefined,
      },
    );
  }

  listTransfers(
    query: Partial<StockTransferListQuery> & Record<string, QueryValue> = {},
  ): Promise<StockTransferListResponse> {
    return this.request<StockTransferListResponse>(
      "GET",
      `/transfers${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  getTransfer(id: number): Promise<StockTransfer> {
    return this.request<StockTransfer>("GET", `/transfers/${id}`);
  }

  createTransfer(input: CreateStockTransferInput): Promise<StockTransfer> {
    return this.request<StockTransfer>("POST", "/transfers", { body: input });
  }

  closeTransfer(
    id: number,
    input: CloseStockTransferInput,
  ): Promise<StockTransfer> {
    return this.request<StockTransfer>("PATCH", `/transfers/${id}/close`, {
      body: input,
    });
  }

  listDeliveryNotes(
    query: Partial<DeliveryNoteListQuery> & Record<string, QueryValue> = {},
  ): Promise<DeliveryNoteListResponse> {
    return this.request<DeliveryNoteListResponse>(
      "GET",
      `/delivery-notes${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  getDeliveryNote(id: number): Promise<DeliveryNoteDetail> {
    return this.request<DeliveryNoteDetail>("GET", `/delivery-notes/${id}`);
  }

  createDeliveryNote(input: CreateDeliveryNoteInput): Promise<DeliveryNote> {
    return this.request<DeliveryNote>("POST", "/delivery-notes", {
      body: input,
    });
  }

  listOutstanding(
    query: Partial<OutstandingListQuery> & Record<string, QueryValue> = {},
  ): Promise<OutstandingListResponse> {
    return this.request<OutstandingListResponse>(
      "GET",
      `/reports/outstanding${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  runPhysicalCount(input: PhysicalCountInput): Promise<PhysicalCountResult> {
    return this.request<PhysicalCountResult>(
      "POST",
      "/reconciliation/physical-count",
      { body: input },
    );
  }

  listAccessories(
    query: Partial<AccessoryListQuery> & Record<string, QueryValue> = {},
  ): Promise<AccessoryListResponse> {
    return this.request<AccessoryListResponse>(
      "GET",
      `/accessories${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  createAccessory(input: CreateAccessoryInput): Promise<Accessory> {
    return this.request<Accessory>("POST", "/accessories", { body: input });
  }

  updateAccessory(
    id: number,
    input: UpdateAccessoryInput,
    options?: { ifMatch?: number },
  ): Promise<Accessory> {
    return this.request<Accessory>("PATCH", `/accessories/${id}`, {
      body: input,
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  listAccessoryRentals(
    query: Partial<AccessoryRentalListQuery> & Record<string, QueryValue> = {},
  ): Promise<AccessoryRentalListResponse> {
    return this.request<AccessoryRentalListResponse>(
      "GET",
      `/accessory-rentals${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  createAccessoryRental(
    input: CreateAccessoryRentalInput,
  ): Promise<AccessoryRental> {
    return this.request<AccessoryRental>("POST", "/accessory-rentals", {
      body: input,
    });
  }

  returnAccessoryRental(
    id: number,
    input: ReturnAccessoryRentalInput,
    options?: { ifMatch?: number },
  ): Promise<AccessoryRental> {
    return this.request<AccessoryRental>(
      "PATCH",
      `/accessory-rentals/${id}/return`,
      {
        body: input,
        headers:
          options?.ifMatch != null
            ? { "If-Match": String(options.ifMatch) }
            : undefined,
      },
    );
  }

  listAlerts(
    query: Partial<AlertListQuery> & Record<string, QueryValue> = {},
  ): Promise<AlertListResponse> {
    return this.request<AlertListResponse>(
      "GET",
      `/alerts${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  alertsSummary(
    query: Partial<{ period_start: string; period_end: string }> &
      Record<string, QueryValue> = {},
  ): Promise<AlertSummary> {
    return this.request<AlertSummary>(
      "GET",
      `/alerts/summary${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  refreshAlerts(): Promise<RefreshAlertsResult> {
    return this.request<RefreshAlertsResult>("POST", "/alerts/refresh");
  }

  resolveAlert(id: number): Promise<Alert> {
    return this.request<Alert>("PATCH", `/alerts/${id}/resolve`);
  }

  updateAlertContact(id: number, input: UpdateAlertContact): Promise<Alert> {
    return this.request<Alert>("PATCH", `/alerts/${id}/contact`, {
      body: input,
    });
  }

  reportFleet(
    query: Partial<FleetQuery> & Record<string, QueryValue> = {},
  ): Promise<FleetReportResponse> {
    return this.request<FleetReportResponse>(
      "GET",
      `/reports/fleet${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  reportFloatAging(
    query: Partial<FloatAgingQuery> & Record<string, QueryValue> = {},
  ): Promise<FloatAgingReportResponse> {
    return this.request<FloatAgingReportResponse>(
      "GET",
      `/reports/float-aging${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  reportRental(
    query: RentalReportQuery & Record<string, QueryValue>,
  ): Promise<RentalReportResponse> {
    return this.request<RentalReportResponse>(
      "GET",
      `/reports/rental${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  reportRefill(
    query: RefillReportQuery & Record<string, QueryValue>,
  ): Promise<RefillReportResponse> {
    return this.request<RefillReportResponse>(
      "GET",
      `/reports/refill${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  reportLoss(
    query: Partial<LossReportQuery> & Record<string, QueryValue> = {},
  ): Promise<LossReportResponse> {
    return this.request<LossReportResponse>(
      "GET",
      `/reports/loss${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  reportSupplierReturns(
    query: Partial<SupplierReturnsQuery> & Record<string, QueryValue> = {},
  ): Promise<SupplierReturnsReportResponse> {
    return this.request<SupplierReturnsReportResponse>(
      "GET",
      `/reports/supplier-returns${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  reportCylinderLife(
    cylinderId: number,
    query: Partial<CylinderLifeQuery> & Record<string, QueryValue> = {},
  ): Promise<CylinderLifeReportResponse> {
    return this.request<CylinderLifeReportResponse>(
      "GET",
      `/reports/cylinder-life/${cylinderId}${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  reportDataQuality(
    query: Partial<DataQualityQuery> & Record<string, QueryValue> = {},
  ): Promise<DataQualityReportResponse> {
    return this.request<DataQualityReportResponse>(
      "GET",
      `/reports/data-quality${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  reportMedicalStatement(
    query: MedicalStatementQuery & Record<string, QueryValue>,
  ): Promise<MedicalStatementReportResponse> {
    return this.request<MedicalStatementReportResponse>(
      "GET",
      `/reports/medical-statement${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  listTerritories(
    query: Partial<TerritoryListQuery> & Record<string, QueryValue> = {},
  ): Promise<TerritoryListResponse> {
    return this.request<TerritoryListResponse>(
      "GET",
      `/territories${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  createTerritory(input: CreateTerritoryInput): Promise<Territory> {
    return this.request<Territory>("POST", "/territories", { body: input });
  }

  listLocalities(
    query: Partial<LocalityListQuery> & Record<string, QueryValue> = {},
  ): Promise<LocalityListResponse> {
    return this.request<LocalityListResponse>(
      "GET",
      `/localities${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  createLocality(input: CreateLocalityInput): Promise<Locality> {
    return this.request<Locality>("POST", "/localities", { body: input });
  }

  getSettings(): Promise<SystemSettings> {
    return this.request<SystemSettings>("GET", "/settings");
  }

  updateSettings(
    input: UpdateSystemSettingsInput,
    options?: { ifMatch?: number },
  ): Promise<SystemSettings> {
    return this.request<SystemSettings>("PATCH", "/settings", {
      body: input,
      headers:
        options?.ifMatch != null
          ? { "If-Match": String(options.ifMatch) }
          : undefined,
    });
  }

  listAdminUsers(
    query: Partial<AdminUserListQuery> & Record<string, QueryValue> = {},
  ): Promise<AdminUserListResponse> {
    return this.request<AdminUserListResponse>(
      "GET",
      `/admin/users${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  getAdminUser(id: number): Promise<AdminUser> {
    return this.request<AdminUser>("GET", `/admin/users/${id}`);
  }

  createAdminUser(input: CreateAdminUserInput): Promise<AdminUser> {
    return this.request<AdminUser>("POST", "/admin/users", { body: input });
  }

  updateAdminUser(id: number, input: UpdateAdminUserInput): Promise<AdminUser> {
    return this.request<AdminUser>("PATCH", `/admin/users/${id}`, {
      body: input,
    });
  }

  removeAdminUser(id: number): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("DELETE", `/admin/users/${id}`);
  }

  getMigrationDataStatus(): Promise<MigrationDataStatus> {
    return this.request<MigrationDataStatus>(
      "GET",
      "/admin/migration-data/status",
    );
  }

  uploadMigrationWorkbook(
    slot: MigrationWorkbookSlot,
    file: Blob,
    filename: string,
    options: { onProgress?: (pct: number) => void } = {},
  ): Promise<MigrationUploadedFile> {
    const form = new FormData();
    form.append("file", file, filename);
    if (options.onProgress) {
      return this.requestFormWithProgress<MigrationUploadedFile>(
        "POST",
        `/admin/migration-data/uploads/${slot}`,
        form,
        options.onProgress,
      );
    }
    return this.requestForm<MigrationUploadedFile>(
      "POST",
      `/admin/migration-data/uploads/${slot}`,
      form,
    );
  }

  dryRunMigration(
    input: Partial<MigrationRunRequest> = {},
  ): Promise<MigrationJobAccepted> {
    return this.request<MigrationJobAccepted>(
      "POST",
      "/admin/migration-data/dry-run",
      {
        body: input,
      },
    );
  }

  syncMigration(
    input: Partial<MigrationRunRequest> = {},
  ): Promise<MigrationJobAccepted> {
    return this.request<MigrationJobAccepted>(
      "POST",
      "/admin/migration-data/sync",
      {
        body: input,
      },
    );
  }

  rollbackMigration(
    input: MigrationRollbackRequest,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "POST",
      "/admin/migration-data/rollback",
      { body: input },
    );
  }

  markMigrationSnapshotGood(
    input: MigrationMarkGoodRequest,
  ): Promise<MigrationSnapshot> {
    return this.request<MigrationSnapshot>(
      "POST",
      "/admin/migration-data/snapshots/mark-good",
      { body: input },
    );
  }

  purgeBusinessData(
    input: MigrationPurgeBusinessRequest,
  ): Promise<MigrationPurgeBusinessResult> {
    return this.request<MigrationPurgeBusinessResult>(
      "POST",
      "/admin/migration-data/purge-business",
      { body: input },
    );
  }

  async downloadMigrationExport(
    dataset: MigrationExportDataset,
  ): Promise<{ blob: Blob; filename: string }> {
    const headers: Record<string, string> = { Accept: "*/*" };
    const access = this.tokens.getAccessToken();
    if (access) headers.Authorization = `Bearer ${access}`;
    const response = await this.fetchImpl(
      `${this.baseUrl}/admin/migration-data/export/${dataset}`,
      { method: "GET", headers },
    );
    if (!response.ok) {
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const parsed = ErrorEnvelope.safeParse(json);
      if (parsed.success) {
        throw ApiClientError.fromEnvelope(response.status, parsed.data);
      }
      throw new ApiClientError(
        "HTTP_ERROR",
        `Request failed with ${response.status}`,
        response.status,
      );
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const filename = match?.[1] ?? `weld-${dataset}.xlsx`;
    const blob = await response.blob();
    return { blob, filename };
  }

  listAuditLogs(
    query: Partial<AuditLogListQuery> & Record<string, QueryValue> = {},
  ): Promise<AuditLogListResponse> {
    return this.request<AuditLogListResponse>(
      "GET",
      `/audit-logs${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  listRentalRates(
    query: Partial<RentalRateListQuery> & Record<string, QueryValue> = {},
  ): Promise<RentalRateListResponse> {
    return this.request<RentalRateListResponse>(
      "GET",
      `/rental-rates${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  createRentalRate(input: CreateRentalRateInput): Promise<RentalRate> {
    return this.request<RentalRate>("POST", "/rental-rates", { body: input });
  }

  updateRentalRate(
    id: number,
    input: UpdateRentalRateInput,
  ): Promise<RentalRate> {
    return this.request<RentalRate>("PATCH", `/rental-rates/${id}`, {
      body: input,
    });
  }

  backfillRentalRates(
    input: BackfillRentalRatesInput = {},
  ): Promise<BackfillRentalRatesResult> {
    return this.request<BackfillRentalRatesResult>(
      "POST",
      "/rental-rates/backfill",
      {
        body: input,
      },
    );
  }

  listRefillRates(
    query: Partial<RefillRateListQuery> & Record<string, QueryValue> = {},
  ): Promise<RefillRateListResponse> {
    return this.request<RefillRateListResponse>(
      "GET",
      `/refill-rates${toQuery(query as Record<string, QueryValue>)}`,
    );
  }

  createRefillRate(input: CreateRefillRateInput): Promise<RefillRate> {
    return this.request<RefillRate>("POST", "/refill-rates", { body: input });
  }

  updateRefillRate(
    id: number,
    input: UpdateRefillRateInput,
  ): Promise<RefillRate> {
    return this.request<RefillRate>("PATCH", `/refill-rates/${id}`, {
      body: input,
    });
  }

  backfillRefillRates(
    input: BackfillRefillRatesInput = {},
  ): Promise<BackfillRefillRatesResult> {
    return this.request<BackfillRefillRatesResult>(
      "POST",
      "/refill-rates/backfill",
      {
        body: input,
      },
    );
  }

  createBillingRun(input: CreateBillingRunInput): Promise<BillingRunDetail> {
    return this.request<BillingRunDetail>("POST", "/billing/runs", {
      body: input,
    });
  }

  getBillingRun(id: number): Promise<BillingRunDetail> {
    return this.request<BillingRunDetail>("GET", `/billing/runs/${id}`);
  }

  approveBillingRun(id: number): Promise<BillingRunDetail> {
    return this.request<BillingRunDetail>(
      "POST",
      `/billing/runs/${id}/approve`,
    );
  }

  exportBillingRun(id: number): Promise<BillingExportPayload> {
    return this.request<BillingExportPayload>(
      "GET",
      `/billing/runs/${id}/export`,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      auth?: boolean;
      retried?: boolean;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const useAuth = options.auth !== false;
    if (useAuth) {
      const access = this.tokens.getAccessToken();
      if (access) headers.Authorization = `Bearer ${access}`;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (
      response.status === 401 &&
      useAuth &&
      !options.retried &&
      this.tokens.getRefreshToken()
    ) {
      try {
        await this.refresh();
        return this.request<T>(method, path, { ...options, retried: true });
      } catch {
        this.tokens.clearTokens();
      }
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const parsed = ErrorEnvelope.safeParse(json);
      if (parsed.success) {
        throw ApiClientError.fromEnvelope(response.status, parsed.data);
      }
      throw new ApiClientError(
        "HTTP_ERROR",
        `Request failed with ${response.status}`,
        response.status,
      );
    }

    return json as T;
  }

  private async requestForm<T>(
    method: string,
    path: string,
    form: FormData,
    options: { auth?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const useAuth = options.auth !== false;
    if (useAuth) {
      const access = this.tokens.getAccessToken();
      if (access) headers.Authorization = `Bearer ${access}`;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: form,
    });

    if (
      response.status === 401 &&
      useAuth &&
      !options.retried &&
      this.tokens.getRefreshToken()
    ) {
      try {
        await this.refresh();
        return this.requestForm<T>(method, path, form, {
          ...options,
          retried: true,
        });
      } catch {
        this.tokens.clearTokens();
      }
    }

    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const parsed = ErrorEnvelope.safeParse(json);
      if (parsed.success) {
        throw ApiClientError.fromEnvelope(response.status, parsed.data);
      }
      throw new ApiClientError(
        "HTTP_ERROR",
        `Request failed with ${response.status}`,
        response.status,
      );
    }

    return json as T;
  }

  /**
   * Multipart upload with XHR so browsers can report upload progress for large .xls files.
   */
  private requestFormWithProgress<T>(
    method: string,
    path: string,
    form: FormData,
    onProgress: (pct: number) => void,
    options: { auth?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const useAuth = options.auth !== false;
    return new Promise<T>((resolvePromise, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${this.baseUrl}${path}`);
      xhr.responseType = "text";
      xhr.setRequestHeader("Accept", "application/json");
      if (useAuth) {
        const access = this.tokens.getAccessToken();
        if (access) xhr.setRequestHeader("Authorization", `Bearer ${access}`);
      }
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable || ev.total <= 0) return;
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      };
      xhr.onload = () => {
        void (async () => {
          const text = xhr.responseText ?? "";
          let json: unknown = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          if (xhr.status === 401 && useAuth && !options.retried) {
            if (this.tokens.getRefreshToken()) {
              try {
                await this.refresh();
                resolvePromise(
                  await this.requestFormWithProgress<T>(
                    method,
                    path,
                    form,
                    onProgress,
                    { ...options, retried: true },
                  ),
                );
                return;
              } catch {
                this.tokens.clearTokens();
              }
            }
          }
          if (xhr.status < 200 || xhr.status >= 300) {
            const parsed = ErrorEnvelope.safeParse(json);
            if (parsed.success) {
              reject(ApiClientError.fromEnvelope(xhr.status, parsed.data));
              return;
            }
            reject(
              new ApiClientError(
                "HTTP_ERROR",
                `Request failed with ${xhr.status}`,
                xhr.status,
              ),
            );
            return;
          }
          onProgress(100);
          resolvePromise(json as T);
        })();
      };
      xhr.onerror = () => {
        reject(
          new ApiClientError("NETWORK_ERROR", "Network error during upload", 0),
        );
      };
      xhr.send(form);
    });
  }
}

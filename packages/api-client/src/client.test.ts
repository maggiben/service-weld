import assert from "node:assert/strict";
import { ApiClientError } from "./errors";
import { WeldApiClient, type TokenStore } from "./client";

function memoryTokens(): TokenStore {
  let access: string | null = null;
  let refresh: string | null = null;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    setTokens: (left, row) => {
      access = left;
      refresh = row;
    },
    clearTokens: () => {
      access = null;
      refresh = null;
    },
  };
}

describe("ApiClientError", () => {
  it("fromEnvelope maps fields", () => {
    const err = ApiClientError.fromEnvelope(422, {
      error: {
        code: "VALIDATION_FAILED",
        message: "bad",
        request_id: "r1",
      },
    });
    assert.equal(err.code, "VALIDATION_FAILED");
    assert.equal(err.requestId, "r1");
  });
});

describe("WeldApiClient", () => {
  let tokens: TokenStore;

  beforeEach(() => {
    tokens = memoryTokens();
  });

  function client(handler: (url: string, init: RequestInit) => Response) {
    return new WeldApiClient({
      baseUrl: "http://api.test/api/v1/",
      tokens,
      fetch: async (input, init = {}) => handler(String(input), init),
    });
  }

  function json(status: number, body: unknown): Response {
    return new Response(
      body === null || body === undefined ? null : JSON.stringify(body),
      { status, headers: { "content-type": "application/json" } },
    );
  }

  const page = {
    data: [],
    page: {
      limit: 50,
      next_cursor: null,
      has_more: false,
      total_estimate: 0,
    },
  };

  it("exercises public methods via mock fetch", async () => {
    tokens.setTokens("tok", "ref");
    const api = client((url, init) => {
      if (url.includes("/auth/login") || url.includes("/auth/refresh")) {
        return json(200, {
          access_token: "a",
          refresh_token: "r",
          expires_in: 900,
          roles: ["ADMIN"],
          territories: [],
        });
      }
      if (url.includes("/auth/logout") || init.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/export") && !url.includes("/migration-data/export")) {
        return json(200, { format: "csv", content: "x" });
      }
      if (
        url.includes("/pdf") ||
        url.includes("/arca/csr") ||
        url.includes("/migration-data/export")
      ) {
        return new Response(new Blob(["%PDF"]), {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'filename="doc.pdf"',
          },
        });
      }
      if (url.includes("/auth/me")) {
        return json(200, {
          id: 1,
          username: "u",
          roles: [],
          territories: [],
          territory_scopes: [],
          capabilities: [],
        });
      }
      return json(200, page.data ? page : { id: 1 });
    });

    await api.login("u", "p");
    await api.me();
    await api.listClients({});
    await api.getClient(1);
    await api.getClientAccount(1);
    await api.createClient(
      { name: "A", territory_id: 1, contacts: [] },
      {
        force: true,
        idempotencyKey: "k",
      },
    );
    await api.updateClient(1, { address_street: "Calle 1" }, { ifMatch: 1 });
    await api.deleteClient(1, { ifMatch: 1 });
    await api.listCylinders({});
    await api.getCylinder(1);
    await api.getCylinderHistory(1);
    await api.createCylinder({
      owner_party_id: 1,
      serial_number: "S",
      ownership_basis: "OURS",
    });
    await api.updateCylinder(1, { gas_code: "O2" }, { ifMatch: 1 });
    await api.fillCylinder(1, { ifMatch: 1 });
    await api.emptyCylinder(1, { ifMatch: 1 });
    await api.listMovements({});
    await api.getMovement(1);
    await api.createMovement({
      cylinder_id: 1,
      holder_party_id: 2,
      movement_kind: "RENTAL",
      delivery_date: "2024-01-01",
    });
    await api.returnMovement(1, { return_date: "2024-01-02" }, { ifMatch: 1 });
    await api.swapMovement(
      1,
      { returned_cylinder_id: 2, return_date: "2024-01-02" },
      { ifMatch: 1 },
    );
    await api.voidMovement(1, { reason: "x" }, { ifMatch: 1 });
    await api.reportCylinderLoss(
      1,
      { outcome: "LOST", occurred_on: "2024-01-02" },
      { ifMatch: 1 },
    );
    await api.replaceCylinder(
      1,
      {
        replacement_cylinder_id: 2,
        client_party_id: 3,
        occurred_on: "2024-01-02",
      },
      { ifMatch: 1 },
    );
    await api.listBatteries({});
    await api.getBattery(1);
    await api.createBattery({
      battery_code: "B",
      owner_party_id: 1,
      member_cylinder_ids: [1, 2],
    });
    await api.addBatteryMember(1, { cylinder_id: 3 });
    await api.removeBatteryMember(1, 3);
    await api.fillBattery(1, { ifMatch: 1 });
    await api.emptyBattery(1, { ifMatch: 1 });
    await api.listSupplierLoans({});
    await api.getSupplierLoan(1);
    await api.createSupplierLoan({
      cylinder_id: 1,
      supplier_party_id: 2,
      received_from_supplier: "2024-01-01",
    });
    await api.advanceSupplierLoan(1, {
      stage: "OUT_TO_CLIENT",
      date: "2024-01-02",
    });
    await api.listTransfers({});
    await api.getTransfer(1);
    await api.createTransfer({
      cylinder_id: 1,
      from_party_id: 1,
      to_party_id: 2,
      transfer_date: "2024-01-01",
    });
    await api.closeTransfer(1, { return_date: "2024-01-15" });
    await api.listDeliveryNotes({});
    await api.getDeliveryNote(1);
    await api.downloadDeliveryNotePdf(1, { copy: "ORIGINAL" });
    await api.createDeliveryNote({
      client_party_id: 1,
      remito_type: "DELIVERY",
      observations: "note",
    });
    await api.updateDeliveryNote(1, { version: 1, observations: "x" });
    const remitoTransition = { version: 1 };
    await api.prepareDeliveryNote(1, remitoTransition);
    await api.assignDeliveryNote(1, remitoTransition);
    await api.loadDeliveryNote(1, remitoTransition);
    await api.dispatchDeliveryNote(1, remitoTransition);
    await api.deliverDeliveryNote(1, remitoTransition);
    await api.signDeliveryNote(1, remitoTransition);
    await api.closeDeliveryNote(1, remitoTransition);
    await api.cancelDeliveryNote(1, remitoTransition);
    await api.startDeliveryNotePicking(1, remitoTransition);
    await api.completeDeliveryNotePicking(1, remitoTransition);
    await api.addDeliveryNoteLine(1, {
      item_kind: "CYLINDER",
      cylinder_id: 1,
    });
    await api.updateDeliveryNoteLine(1, 2, { qty: 1 });
    await api.deleteDeliveryNoteLine(1, 2);
    await api.addDeliveryNoteIncident(1, {
      type: "OTHER",
      description: "x",
    });
    await api.updateDeliveryNoteIncident(1, 3, { description: "y" });
    await api.listWarehouses({});
    await api.listVehicles({});
    await api.createVehicle({ plate: "ABC123", name: "Van" });
    await api.listDrivers({});
    await api.createDriver({ user_id: 1, display_name: "Leo" });
    await api.listRemitoSeries({});
    await api.listOutstanding({});
    await api.runPhysicalCount({
      counted_on: "2024-01-01",
      serial_numbers: ["A"],
    });
    await api.listAccessories({});
    await api.createAccessory({
      accessory_type: "REGULATOR",
      owner_party_id: 1,
    });
    await api.updateAccessory(1, { state: "IN_STOCK" });
    await api.listAccessoryRentals({});
    await api.createAccessoryRental({
      accessory_id: 1,
      client_party_id: 2,
      start_date: "2024-01-01",
    });
    await api.returnAccessoryRental(1, { end_date: "2024-01-02" });
    await api.listAlerts({});
    await api.alertsSummary();
    await api.refreshAlerts();
    await api.resolveAlert(1);
    await api.updateAlertContact(1, { contact_note: "ok" });
    await api.reportFleet({});
    await api.reportFloatAging({});
    await api.reportRental({});
    await api.reportLoss({});
    await api.reportSupplierReturns({});
    await api.reportCylinderLife(1, {});
    await api.reportDataQuality({});
    await api.reportMedicalStatement({
      client_party_id: 1,
      period_start: "2024-01-01",
      period_end: "2024-01-31",
    });
    await api.reportRefill({});
    await api.listTerritories({});
    await api.createTerritory({ name: "T" });
    await api.listLocalities({});
    await api.createLocality({ name: "L" });
    await api.getSettings();
    await api.updateSettings({
      supplier_loan_overdue_days: 90,
      long_outstanding_days: 60,
      business_timezone: "America/Argentina/Buenos_Aires",
      rental_min_days: 0,
      primary_language: "es",
    });
    await api.listAdminUsers({});
    await api.getAdminUser(1);
    await api.createAdminUser({
      username: "driver.leo",
      password: "password1",
      roles: ["DRIVER"],
      territory_ids: [1],
    });
    await api.updateAdminUser(1, { is_active: false });
    await api.removeAdminUser(2);
    await api.getArcaDashboard("HOMOLOGATION");
    await api.getArcaCompanyProfile();
    await api.updateArcaCompanyProfile({ legal_name: "Weld" });
    await api.getArcaTestingMode();
    await api.updateArcaTestingMode({ enabled: true });
    await api.getArcaSimulationMode();
    await api.updateArcaSimulationMode({ enabled: true });
    await api.generateArcaKeys({
      environment: "HOMOLOGATION",
      confirm_regenerate: true,
    });
    await api.downloadArcaCsr("HOMOLOGATION");
    await api.uploadArcaCertificate(
      "HOMOLOGATION",
      new Blob(["cert"]),
      "cert.pem",
    );
    await api.validateArcaCertificate("HOMOLOGATION");
    await api.deleteArcaCertificate({
      environment: "HOMOLOGATION",
      reason: "rotate",
    });
    await api.testArcaConnection("HOMOLOGATION");
    await api.getMigrationDataStatus();
    await api.uploadMigrationWorkbook("junin", new Blob(["xls"]), "book.xlsx");
    await api.dryRunMigration({});
    await api.syncMigration({});
    await api.rollbackMigration({ snapshot_id: "snap-1" });
    await api.markMigrationSnapshotGood({ snapshot_id: "snap-1" });
    await api.purgeBusinessData({ confirmation: "VACIAR DATOS" });
    await api.downloadMigrationExport("clients");
    await api.listAuditLogs({});
    await api.listRentalRates({});
    await api.createRentalRate({ amount: 1, effective_from: "2024-01-01" });
    await api.updateRentalRate(1, { amount: 2 });
    await api.backfillRentalRates({});
    await api.backfillRentalRates({ rate_id: 1 });
    await api.listRefillRates({});
    await api.createRefillRate({ amount: 1, effective_from: "2024-01-01" });
    await api.updateRefillRate(1, { amount: 2 });
    await api.backfillRefillRates({});
    await api.backfillRefillRates({ rate_id: 1 });
    await api.createBillingRun({
      period_start: "2024-01-01",
      period_end: "2024-01-31",
    });
    await api.getBillingRun(1);
    await api.approveBillingRun(1);
    await api.exportBillingRun(1);
    await api.getInvoice(1);
    await api.approveInvoice(1);
    await api.authorizeInvoice(1);
    await api.issueInvoice(1);
    await api.getBillingSimulationMode();
    await api.resetSimulationInvoice(1);
    await api.downloadInvoicePdf(1);
    await api.logout();
  });

  it("401 retries once after refresh", async () => {
    tokens.setTokens("old", "ref");
    let hits = 0;
    const api = client((url) => {
      if (url.includes("/auth/refresh")) {
        return json(200, {
          access_token: "new",
          refresh_token: "ref2",
          expires_in: 900,
          roles: [],
          territories: [],
        });
      }
      hits += 1;
      if (hits === 1) return json(401, { error: "x" });
      return json(200, {
        id: 1,
        username: "u",
        roles: [],
        territories: [],
        territory_scopes: [],
        capabilities: [],
      });
    });
    await api.me();
    assert.equal(tokens.getAccessToken(), "new");
  });

  it("maps HTTP_ERROR when body is not an envelope", async () => {
    tokens.setTokens("a", "r");
    const api = client(() => json(500, { nope: true }));
    await assert.rejects(
      () => api.me(),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, "HTTP_ERROR");
        return true;
      },
    );
  });

  it("refresh requires token", async () => {
    const api = client(() => json(200, {}));
    await assert.rejects(() => api.refresh(), /No refresh token/);
  });

  it("covers auth and binary error branches", async () => {
    tokens.setTokens("a", "r");
    const apiOk = client((url) => {
      if (url.includes("/auth/login")) {
        return json(200, {
          access_token: "a",
          refresh_token: "r",
          expires_in: 900,
          roles: [],
          territories: [],
        });
      }
      return json(200, { id: 1 });
    });
    await apiOk.login("u", "p", "123456");
    await apiOk.createClient(
      { name: "B", territory_id: 1, contacts: [] },
      undefined,
    );
    await apiOk.updateClient(1, { address_street: "x" });
    await apiOk.deleteClient(1);
    await apiOk.fillCylinder(1);
    await apiOk.emptyCylinder(1);
    await apiOk.updateCylinder(1, { gas_code: "N2" });
    await apiOk.returnMovement(1, { return_date: "2024-01-02" });
    await apiOk.swapMovement(1, {
      returned_cylinder_id: 2,
      return_date: "2024-01-02",
    });
    await apiOk.voidMovement(1, { reason: "x" });
    await apiOk.fillBattery(1);
    await apiOk.emptyBattery(1);
    await apiOk.updateAccessory(1, { state: "IN_STOCK" });
    await apiOk.updateSettings({
      supplier_loan_overdue_days: 90,
      long_outstanding_days: 60,
      business_timezone: "America/Argentina/Buenos_Aires",
      rental_min_days: 0,
      primary_language: "es",
    });
    await apiOk.listClients({ q: "", limit: 10 });

    tokens.clearTokens();
    const apiLogout = client(() => json(200, {}));
    await apiLogout.logout();

    tokens.setTokens("a", "r");
    const apiPdfFail = client(() =>
      json(400, {
        error: {
          code: "VALIDATION_FAILED",
          message: "bad",
          request_id: "r1",
        },
      }),
    );
    await assert.rejects(() => apiPdfFail.downloadDeliveryNotePdf(1));
    await assert.rejects(() => apiPdfFail.downloadInvoicePdf(1));
    await assert.rejects(() => apiPdfFail.downloadMigrationExport("clients"));
    await assert.rejects(() => apiPdfFail.downloadArcaCsr("PRODUCTION"));

    const apiPdfPlain = client(
      () => new Response("nope", { status: 500, statusText: "err" }),
    );
    await assert.rejects(() => apiPdfPlain.downloadDeliveryNotePdf(1));
    await assert.rejects(() => apiPdfPlain.downloadInvoicePdf(9));
    await assert.rejects(() => apiPdfPlain.downloadMigrationExport("all"));

    const apiBlobOk = client(
      () =>
        new Response(new Blob(["x"]), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    );
    await apiBlobOk.downloadArcaCsr();
    await apiBlobOk.downloadDeliveryNotePdf(2);
    await apiBlobOk.downloadInvoicePdf(2);
    await apiBlobOk.downloadMigrationExport("cylinders");

    const apiFormFail = client(() =>
      json(400, {
        error: {
          code: "VALIDATION_FAILED",
          message: "bad",
          request_id: "r2",
        },
      }),
    );
    await assert.rejects(() =>
      apiFormFail.uploadArcaCertificate(
        "HOMOLOGATION",
        new Blob(["c"]),
        "c.pem",
      ),
    );
    await assert.rejects(() =>
      apiFormFail.uploadMigrationWorkbook("propios", new Blob(["x"]), "x.xls"),
    );

    // Progress upload uses XHR (browser path).
    class FakeXhr {
      upload = {
        onprogress: null as null | ((ev: ProgressEvent<EventTarget>) => void),
      };
      status = 200;
      responseText = JSON.stringify({
        slot: "junin",
        original_name: "book.xlsx",
        size_bytes: 1,
        uploaded_at: "2024-01-01T00:00:00.000Z",
      });
      open() {}
      setRequestHeader() {}
      send() {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 50,
          total: 100,
        } as ProgressEvent<EventTarget>);
        this.upload.onprogress?.({
          lengthComputable: false,
          loaded: 0,
          total: 0,
        } as ProgressEvent<EventTarget>);
        queueMicrotask(() => this.onload?.());
      }
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
    }
    const previousXhr = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    try {
      tokens.setTokens("a", "r");
      const apiProgress = client(() => json(200, {}));
      await apiProgress.uploadMigrationWorkbook(
        "junin",
        new Blob(["xls"]),
        "book.xlsx",
        { onProgress: () => undefined },
      );
    } finally {
      globalThis.XMLHttpRequest = previousXhr;
    }

    // 401 → refresh → retry for blob/form helpers
    tokens.setTokens("old", "ref");
    let blobHits = 0;
    const apiBlobRetry = client((url) => {
      if (url.includes("/auth/refresh")) {
        return json(200, {
          access_token: "new",
          refresh_token: "ref2",
          expires_in: 900,
          roles: [],
          territories: [],
        });
      }
      blobHits += 1;
      if (blobHits === 1) return json(401, { error: "x" });
      return new Response(new Blob(["ok"]), { status: 200 });
    });
    await apiBlobRetry.downloadArcaCsr("HOMOLOGATION");

    tokens.setTokens("old", "ref");
    let formHits = 0;
    const apiFormRetry = client((url) => {
      if (url.includes("/auth/refresh")) {
        return json(200, {
          access_token: "new",
          refresh_token: "ref2",
          expires_in: 900,
          roles: [],
          territories: [],
        });
      }
      formHits += 1;
      if (formHits === 1) return json(401, { error: "x" });
      return json(200, {
        slot: "chacabuco",
        original_name: "a.xls",
        size_bytes: 2,
        uploaded_at: "2024-01-01T00:00:00.000Z",
      });
    });
    await apiFormRetry.uploadMigrationWorkbook(
      "chacabuco",
      new Blob(["x"]),
      "a.xls",
    );
  });
});

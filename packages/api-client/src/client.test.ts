import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { ApiClientError } from "./errors";
import { WeldApiClient, type TokenStore } from "./client";

function memoryTokens(): TokenStore {
  let access: string | null = null;
  let refresh: string | null = null;
  return {
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    setTokens: (a, r) => {
      access = a;
      refresh = r;
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
      if (url.includes("/export")) {
        return json(200, { format: "csv", content: "x" });
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
    await api.reportCylinderLife({});
    await api.reportDataQuality({});
    await api.reportMedicalStatement({});
    await api.listTerritories({});
    await api.createTerritory({ name: "T" });
    await api.listLocalities({});
    await api.createLocality({ name: "L" });
    await api.getSettings();
    await api.updateSettings({
      supplier_loan_overdue_days: 90,
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
    await api.listAuditLogs({});
    await api.listRentalRates({});
    await api.createRentalRate({ amount: 1, effective_from: "2024-01-01" });
    await api.updateRentalRate(1, { amount: 2 });
    await api.createBillingRun({
      period_start: "2024-01-01",
      period_end: "2024-01-31",
    });
    await api.getBillingRun(1);
    await api.approveBillingRun(1);
    await api.exportBillingRun(1);
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
});

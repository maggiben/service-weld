import { AdminUsersService } from "../admin-users/admin-users.service";
import { AlertsService } from "../alerts/alerts.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { MastersService } from "../masters/masters.service";
import { RatesService } from "../rates/rates.service";
import { ReconciliationService } from "../reconciliation/reconciliation.service";
import { ReportsService } from "../reports/reports.service";
import { SettingsService } from "../settings/settings.service";

describe("thin orchestration services", () => {
  it("AlertsService maps not found and refreshes", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ data: [] }),
      openCount: vi.fn().mockResolvedValue(3),
      resolve: vi.fn(),
      updateContact: vi.fn(),
      refresh: vi.fn().mockResolvedValue({ created: 1 }),
    };
    const service = new AlertsService(repository as never);
    expect(await service.list({} as never)).toEqual({ data: [] });
    expect(await service.summary()).toEqual({ open_count: 3 });
    expect(await service.refresh()).toEqual({ created: 1 });

    repository.resolve.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(service.resolve(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    repository.resolve.mockRejectedValue(new Error("boom"));
    await expect(service.resolve(1)).rejects.toThrow("boom");
    repository.resolve.mockResolvedValue({ id: 1 });
    expect(await service.resolve(1)).toEqual({ id: 1 });

    repository.updateContact.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(service.updateContact(1, {} as never)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    repository.updateContact.mockRejectedValue(new Error("boom"));
    await expect(service.updateContact(1, {} as never)).rejects.toThrow("boom");
    repository.updateContact.mockResolvedValue({ id: 1 });
    expect(await service.updateContact(1, {} as never)).toEqual({ id: 1 });
  });

  it("RatesService validates date ranges", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      getById: vi.fn().mockResolvedValue({
        id: 1,
        effective_from: "2026-01-01",
        effective_to: null,
      }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
    };
    const service = new RatesService(
      repository as never,
      {
        createDraft: vi.fn(),
      } as never,
    );
    expect(await service.list({} as never)).toEqual({ data: [] });
    await expect(
      service.create({
        effective_from: "2026-02-01",
        effective_to: "2026-01-01",
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await service.create({
      effective_from: "2026-01-01",
      effective_to: "2026-02-01",
    } as never);
    await expect(
      service.update(1, { effective_to: "2025-01-01" } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await service.update(1, { effective_from: "2026-01-01" } as never);
  });

  it("AdminUsersService / SettingsService / AuditLogsService / MastersService delegate", async () => {
    const adminRepo = {
      list: vi.fn().mockResolvedValue({ data: [] }),
      getById: vi.fn().mockResolvedValue({ id: 1 }),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const admin = new AdminUsersService(adminRepo as never);
    expect(await admin.list({} as never)).toEqual({ data: [] });
    expect(await admin.get(1)).toEqual({ id: 1 });
    expect(await admin.create({} as never)).toEqual({ id: 1 });
    expect(await admin.update(1, {} as never, 2)).toEqual({ id: 1 });
    await admin.remove(1, 2);

    const settingsRepo = {
      getSettings: vi.fn().mockResolvedValue({ version: 1 }),
      updateSettings: vi.fn().mockResolvedValue({ version: 2 }),
    };
    const settings = new SettingsService(settingsRepo as never);
    expect(await settings.getSettings()).toEqual({ version: 1 });
    expect(await settings.updateSettings({} as never, 1)).toEqual({
      version: 2,
    });

    const auditRepo = { list: vi.fn().mockResolvedValue({ data: [] }) };
    expect(
      await new AuditLogsService(auditRepo as never).list({} as never),
    ).toEqual({ data: [] });

    const mastersRepo = {
      listTerritories: vi.fn().mockResolvedValue({ data: [] }),
      createTerritory: vi.fn().mockResolvedValue({ id: 1 }),
      listLocalities: vi.fn().mockResolvedValue({ data: [] }),
      createLocality: vi.fn().mockResolvedValue({ id: 2 }),
    };
    const masters = new MastersService(mastersRepo as never);
    expect(await masters.listTerritories({} as never)).toEqual({ data: [] });
    expect(await masters.createTerritory({} as never)).toEqual({ id: 1 });
    expect(await masters.listLocalities({} as never)).toEqual({ data: [] });
    expect(await masters.createLocality({} as never)).toEqual({ id: 2 });
  });

  it("ReportsService wraps repository rows", async () => {
    const repository = {
      fleet: vi.fn().mockResolvedValue([{ id: 1 }]),
      floatAging: vi.fn().mockResolvedValue({ data: [], page: {} }),
      rental: vi.fn().mockResolvedValue([]),
      loss: vi.fn().mockResolvedValue([]),
      supplierReturns: vi.fn().mockResolvedValue({ data: [], page: {} }),
      cylinderLife: vi.fn().mockResolvedValue([]),
      medicalStatement: vi.fn().mockResolvedValue([]),
      dataQuality: vi.fn().mockResolvedValue({ data: [], page: {} }),
    };
    const service = new ReportsService(repository as never);
    expect((await service.fleet({} as never)).data).toEqual([{ id: 1 }]);
    expect((await service.floatAging({} as never)).page).toEqual({});
    expect((await service.rental({} as never)).generated_at).toEqual(
      expect.any(String),
    );
    await service.loss({} as never);
    await service.supplierReturns({} as never);
    await service.cylinderLife(1, { gte: "a", lte: "b" } as never);
    await service.medicalStatement({} as never);
    await service.dataQuality({} as never);
  });

  it("ReconciliationService validates count date", async () => {
    const repository = {
      listOutstanding: vi.fn().mockResolvedValue({ data: [] }),
      runPhysicalCount: vi.fn().mockResolvedValue({ matched: 1 }),
    };
    const service = new ReconciliationService(repository as never);
    expect(await service.listOutstanding({} as never)).toEqual({ data: [] });
    expect(() =>
      service.runPhysicalCount({ counted_on: "1800-01-01" } as never),
    ).toThrow(expect.objectContaining({ code: "DATE_OUT_OF_RANGE" }));
    await expect(
      service.runPhysicalCount({ counted_on: "2026-06-01" } as never),
    ).resolves.toEqual({ matched: 1 });
  });
});

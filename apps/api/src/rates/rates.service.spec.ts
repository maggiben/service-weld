import { principal } from "../test-utils/fixtures";
import { RatesService } from "./rates.service";

describe("RatesService", () => {
  const repository = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    backfillDailyDefaults: jest.fn(),
    listAllCandidates: jest.fn(),
  };
  const billingService = {
    createDraft: jest.fn(),
  };
  const service = new RatesService(
    repository as never,
    billingService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("rejects inverted effective dates on create/update", async () => {
    await expect(
      service.create({
        amount: 10,
        effective_from: "2026-02-01",
        effective_to: "2026-01-01",
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.getById.mockResolvedValue({
      id: 1,
      effective_from: "2026-01-01",
      effective_to: null,
    });
    await expect(
      service.update(1, {
        effective_from: "2026-03-01",
        effective_to: "2026-02-01",
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("backfills defaults from a general rate then regenerates history draft", async () => {
    repository.getById.mockResolvedValue({
      id: 7,
      client_party_id: 3,
      gas_code: null,
      capacity_m3: null,
      capacity_unit: "M3",
      period: "DAILY",
      amount: 85,
      effective_from: "2020-01-01",
      effective_to: null,
    });
    repository.backfillDailyDefaults.mockResolvedValue({
      filled: 2,
      increased: 1,
    });
    billingService.createDraft.mockResolvedValue({
      id: 99,
      invoice_count: 2,
      invoices: [
        { charge_lines: [{ id: 1 }, { id: 2 }] },
        { charge_lines: [{ id: 3 }] },
      ],
      skipped_no_rate: 4,
      total: 1200,
    });

    const user = principal();
    const result = await service.backfill(user, { rate_id: 7 });

    expect(repository.backfillDailyDefaults).toHaveBeenCalledWith({
      clientPartyId: 3,
      dailyAmount: 85,
    });
    expect(billingService.createDraft).toHaveBeenCalledWith(user, {
      mode: "history",
      client_party_id: 3,
    });
    expect(result).toEqual({
      defaults_filled: 2,
      defaults_increased: 1,
      billing_run_id: 99,
      invoice_count: 2,
      line_count: 3,
      skipped_no_rate: 4,
      total: 1200,
    });
  });

  it("skips default fill for gas/size-specific rates but still bills", async () => {
    repository.getById.mockResolvedValue({
      id: 8,
      client_party_id: null,
      gas_code: "O2",
      capacity_m3: 10,
      capacity_unit: "M3",
      period: "MONTHLY",
      amount: 3000,
      effective_from: "2020-01-01",
      effective_to: null,
    });
    billingService.createDraft.mockResolvedValue({
      id: 100,
      invoice_count: 0,
      invoices: [],
      total: 0,
    });

    const result = await service.backfill(principal(), { rate_id: 8 });

    expect(repository.backfillDailyDefaults).not.toHaveBeenCalled();
    expect(billingService.createDraft).toHaveBeenCalledWith(expect.anything(), {
      mode: "history",
      client_party_id: null,
    });
    expect(result.defaults_filled).toBe(0);
    expect(result.defaults_increased).toBe(0);
    expect(result.billing_run_id).toBe(100);
  });

  it("backfill without rate_id uses latest general global rate for defaults", async () => {
    repository.listAllCandidates.mockResolvedValue([
      {
        id: 1,
        client_party_id: null,
        gas_code: null,
        capacity_m3: null,
        capacity_unit: "M3",
        period: "DAILY",
        amount: 70,
        effective_from: "2024-01-01",
        effective_to: null,
      },
      {
        id: 2,
        client_party_id: null,
        gas_code: null,
        capacity_m3: null,
        capacity_unit: "M3",
        period: "DAILY",
        amount: 85,
        effective_from: "2025-06-01",
        effective_to: null,
      },
      {
        id: 3,
        client_party_id: null,
        gas_code: "O2",
        capacity_m3: null,
        capacity_unit: "M3",
        period: "DAILY",
        amount: 99,
        effective_from: "2026-01-01",
        effective_to: null,
      },
    ]);
    repository.backfillDailyDefaults.mockResolvedValue({
      filled: 5,
      increased: 2,
    });
    billingService.createDraft.mockResolvedValue({
      id: 50,
      invoice_count: 1,
      invoices: [{ charge_lines: [{ id: 1 }] }],
      skipped_no_rate: 0,
      total: 50,
    });

    const result = await service.backfill(principal(), {});

    expect(repository.backfillDailyDefaults).toHaveBeenCalledWith({
      clientPartyId: null,
      dailyAmount: 85,
    });
    expect(result.defaults_filled).toBe(5);
    expect(result.defaults_increased).toBe(2);
    expect(result.line_count).toBe(1);
    expect(result.billing_run_id).toBe(50);
  });
});

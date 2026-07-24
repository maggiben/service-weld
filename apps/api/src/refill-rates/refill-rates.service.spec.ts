import { principal } from "../test-utils/fixtures";
import { RefillRatesService } from "./refill-rates.service";

describe("RefillRatesService", () => {
  const repository = {
    list: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const billingService = {
    createDraft: jest.fn(),
  };
  const service = new RefillRatesService(
    repository as never,
    billingService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("rejects inverted effective dates on create/update", async () => {
    await expect(
      service.create({
        amount: 1500,
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

  it("backfills by regenerating a history billing draft", async () => {
    billingService.createDraft.mockResolvedValue({
      id: 42,
      invoice_count: 2,
      invoices: [
        { charge_lines: [{ id: 1 }, { id: 2 }] },
        { charge_lines: [{ id: 3 }] },
      ],
      skipped_no_rate: 1,
      total: 4500,
    });

    const user = principal();
    const result = await service.backfill(user, {});

    expect(repository.getById).not.toHaveBeenCalled();
    expect(billingService.createDraft).toHaveBeenCalledWith(user, {
      mode: "history",
    });
    expect(result).toEqual({
      billing_run_id: 42,
      invoice_count: 2,
      line_count: 3,
      skipped_no_rate: 1,
      total: 4500,
    });
  });

  it("verifies rate_id when provided then regenerates history draft", async () => {
    repository.getById.mockResolvedValue({
      id: 9,
      gas_code: "O2",
      capacity_m3: 10,
      capacity_unit: "M3",
      amount: 1500,
      effective_from: "2020-01-01",
      effective_to: null,
    });
    billingService.createDraft.mockResolvedValue({
      id: 50,
      invoice_count: 0,
      invoices: [],
      total: 0,
    });

    const result = await service.backfill(principal(), { rate_id: 9 });

    expect(repository.getById).toHaveBeenCalledWith(9);
    expect(billingService.createDraft).toHaveBeenCalledWith(expect.anything(), {
      mode: "history",
    });
    expect(result.billing_run_id).toBe(50);
    expect(result.line_count).toBe(0);
  });
});

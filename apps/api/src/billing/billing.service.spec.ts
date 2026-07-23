import { principal } from "../test-utils/fixtures";
import { BillingService } from "./billing.service";

describe("BillingService", () => {
  const repository = {
    createDraftRun: jest.fn(),
    getRun: jest.fn(),
    approveRun: jest.fn(),
    exportRun: jest.fn(),
  };
  const service = new BillingService(repository as never);

  beforeEach(() => jest.clearAllMocks());

  it("normalizes history mode drafts", async () => {
    repository.createDraftRun.mockResolvedValue({ id: 1 });
    const user = principal();
    await service.createDraft(user, {
      mode: "history",
      client_party_id: undefined,
    } as never);
    expect(repository.createDraftRun).toHaveBeenCalledWith(
      {
        mode: "history",
        client_party_id: null,
        locality_id: null,
        territory_id: null,
      },
      user.id,
    );

    await service.createDraft(user, {
      mode: "period",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
    } as never);
    expect(repository.createDraftRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "period" }),
      user.id,
    );
  });

  it("gets, approves, and exports runs", async () => {
    repository.getRun.mockResolvedValue(null);
    await expect(service.getRun(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getRun.mockResolvedValue({ id: 1 });
    expect(await service.getRun(1)).toEqual({ id: 1 });

    repository.approveRun.mockResolvedValue({ id: 1, status: "APPROVED" });
    await expect(service.approve(principal(), 1)).resolves.toMatchObject({
      status: "APPROVED",
    });

    repository.exportRun.mockResolvedValue({ invoices: [] });
    await expect(service.export(1)).resolves.toEqual({ invoices: [] });
  });
});

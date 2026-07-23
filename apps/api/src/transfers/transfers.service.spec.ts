import { ApiError } from "../common/errors/api-error";
import { principal } from "../test-utils/fixtures";
import { TransfersService } from "./transfers.service";

describe("TransfersService", () => {
  const repository = {
    list: jest.fn(),
    getById: jest.fn(),
    getCylinder: jest.fn(),
    getParty: jest.fn(),
    create: jest.fn(),
    close: jest.fn(),
  };
  const service = new TransfersService(repository as never);
  const user = principal();

  beforeEach(() => jest.clearAllMocks());

  it("lists and gets", async () => {
    repository.list.mockResolvedValue({ data: [] });
    expect(await service.list({} as never)).toEqual({ data: [] });
    repository.getById.mockResolvedValue(null);
    await expect(service.getById(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("creates with party and cylinder checks", async () => {
    const input = {
      cylinder_id: 1,
      from_party_id: 1,
      to_party_id: 2,
      transfer_date: "2026-06-01",
    };

    await expect(
      service.create(user, {
        ...input,
        from_party_id: 1,
        to_party_id: 1,
      } as never),
    ).rejects.toBeInstanceOf(ApiError);

    repository.getCylinder.mockResolvedValue(null);
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getCylinder.mockResolvedValue({ id: 1, state: "LOST" });
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "CYLINDER_TERMINAL",
    });

    repository.getCylinder.mockResolvedValue({ id: 1, state: "IN_STOCK_FULL" });
    repository.getParty.mockResolvedValueOnce(null);
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    repository.getParty
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null);
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    repository.getParty.mockResolvedValue({ id: 1 });
    repository.create.mockResolvedValue({ id: 9 });
    await expect(service.create(user, input as never)).resolves.toMatchObject({
      id: 9,
    });
  });

  it("closes open transfers", async () => {
    repository.getById.mockResolvedValue(null);
    await expect(
      service.close(1, { return_date: "2026-06-08" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.getById.mockResolvedValue({
      id: 1,
      transfer_date: "2026-06-01",
      return_date: "2026-06-02",
    });
    await expect(
      service.close(1, { return_date: "2026-06-08" }),
    ).rejects.toMatchObject({ code: "ALREADY_CLOSED" });

    repository.getById.mockResolvedValue({
      id: 1,
      transfer_date: "2026-06-01",
      return_date: null,
    });
    repository.close.mockResolvedValue(null);
    await expect(
      service.close(1, { return_date: "2026-06-08" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.close.mockResolvedValue({ id: 1, return_date: "2026-06-08" });
    await expect(
      service.close(1, { return_date: "2026-06-08" }),
    ).resolves.toMatchObject({ return_date: "2026-06-08" });
  });
});

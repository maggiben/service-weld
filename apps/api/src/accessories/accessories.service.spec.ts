import { ApiError } from "../common/errors/api-error";
import { principal } from "../test-utils/fixtures";
import { AccessoriesService } from "./accessories.service";

describe("AccessoriesService", () => {
  const repository = {
    listAccessories: vi.fn(),
    getAccessory: vi.fn(),
    createAccessory: vi.fn(),
    updateAccessory: vi.fn(),
    listRentals: vi.fn(),
    getRental: vi.fn(),
    clientExists: vi.fn(),
    createRental: vi.fn(),
    returnRental: vi.fn(),
  };
  const service = new AccessoriesService(repository as never);
  const user = principal();

  beforeEach(() => vi.clearAllMocks());

  it("CRUD accessories", async () => {
    repository.listAccessories.mockResolvedValue({ data: [] });
    expect(await service.listAccessories({} as never)).toEqual({ data: [] });

    repository.getAccessory.mockResolvedValue(null);
    await expect(service.getAccessory(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.createAccessory.mockResolvedValue({ id: 1, version: 1 });
    await expect(
      service.createAccessory(user, { type: "REGULATOR" } as never),
    ).resolves.toMatchObject({ id: 1 });

    repository.createAccessory.mockRejectedValue({ code: "23505" });
    await expect(
      service.createAccessory(user, { type: "REGULATOR" } as never),
    ).rejects.toMatchObject({ code: "DUPLICATE_ACCESSORY" });

    repository.getAccessory.mockResolvedValue({
      id: 1,
      version: 2,
      state: "IN_STOCK",
    });
    await expect(
      service.updateAccessory(user, 1, { note: "x" } as never, 1),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    repository.updateAccessory.mockResolvedValue({ id: 1, version: 3 });
    await expect(
      service.updateAccessory(user, 1, { note: "x" } as never, 2),
    ).resolves.toMatchObject({ version: 3 });
  });

  it("creates and returns rentals", async () => {
    repository.listRentals.mockResolvedValue({ data: [] });
    expect(await service.listRentals({} as never)).toEqual({ data: [] });

    repository.getAccessory.mockResolvedValue({ id: 1, state: "BROKEN" });
    await expect(
      service.createRental(user, {
        accessory_id: 1,
        client_party_id: 2,
        start_date: "2026-06-01",
      } as never),
    ).rejects.toBeInstanceOf(ApiError);

    repository.getAccessory.mockResolvedValue({ id: 1, state: "IN_STOCK" });
    repository.clientExists.mockResolvedValue(false);
    await expect(
      service.createRental(user, {
        accessory_id: 1,
        client_party_id: 2,
        start_date: "2026-06-01",
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.clientExists.mockResolvedValue(true);
    repository.createRental.mockResolvedValue({ id: 9 });
    await expect(
      service.createRental(user, {
        accessory_id: 1,
        client_party_id: 2,
        start_date: "2026-06-01",
      } as never),
    ).resolves.toMatchObject({ id: 9 });

    repository.createRental.mockRejectedValue({ code: "23505" });
    await expect(
      service.createRental(user, {
        accessory_id: 1,
        client_party_id: 2,
        start_date: "2026-06-01",
      } as never),
    ).rejects.toMatchObject({ code: "ACCESSORY_ALREADY_ON_LOAN" });

    repository.getRental.mockResolvedValue(null);
    await expect(
      service.returnRental(user, 1, { end_date: "2026-06-08" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.getRental.mockResolvedValue({
      id: 1,
      accessory_id: 1,
      start_date: "2026-06-10",
      state: "ON_LOAN",
      version: 1,
    });
    await expect(
      service.returnRental(user, 1, { end_date: "2026-06-08" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.getRental.mockResolvedValue({
      id: 1,
      accessory_id: 1,
      start_date: "2026-06-01",
      state: "RETURNED",
      version: 1,
    });
    repository.getAccessory.mockResolvedValue({ id: 1, state: "ON_LOAN" });
    await expect(
      service.returnRental(user, 1, { end_date: "2026-06-08" }),
    ).rejects.toMatchObject({ code: "NOT_ON_LOAN" });

    repository.getRental.mockResolvedValue({
      id: 1,
      accessory_id: 1,
      start_date: "2026-06-01",
      state: "ON_LOAN",
      version: 2,
    });
    repository.getAccessory.mockResolvedValue({ id: 1, state: "ON_LOAN" });
    await expect(
      service.returnRental(user, 1, { end_date: "2026-06-08" }, 1),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    repository.returnRental.mockResolvedValue({ id: 1, state: "RETURNED" });
    await expect(
      service.returnRental(user, 1, { end_date: "2026-06-08" }, 2),
    ).resolves.toMatchObject({ state: "RETURNED" });
  });
});

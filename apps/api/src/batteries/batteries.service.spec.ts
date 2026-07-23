import { ApiError } from "../common/errors/api-error";
import { principal } from "../test-utils/fixtures";
import { BatteriesService } from "./batteries.service";

function packInfo(overrides: Record<string, unknown> = {}) {
  return {
    packaging: "SINGLE",
    battery_id: null,
    state: "IN_STOCK_EMPTY",
    owner_party_id: 1,
    ...overrides,
  };
}

describe("BatteriesService", () => {
  const repository = {
    list: jest.fn(),
    getById: jest.fn(),
    getCylinderPackInfo: jest.fn(),
    create: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    fill: jest.fn(),
    empty: jest.fn(),
  };
  const service = new BatteriesService(repository as never);
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

  it("creates with member validation", async () => {
    const base = { owner_party_id: 1, code: "B1" };

    await expect(
      service.create(user, { ...base, member_cylinder_ids: [1] } as never),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      service.create(user, {
        ...base,
        member_cylinder_ids: [1, 1],
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.getCylinderPackInfo.mockResolvedValue(null);
    await expect(
      service.create(user, { ...base, member_cylinder_ids: [1, 2] } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.getCylinderPackInfo.mockResolvedValue(packInfo());
    repository.create.mockResolvedValue({ id: 1 });
    await expect(
      service.create(user, { ...base, member_cylinder_ids: [1, 2] } as never),
    ).resolves.toMatchObject({ id: 1 });

    repository.create.mockRejectedValue({ code: "23505" });
    await expect(
      service.create(user, { ...base, member_cylinder_ids: [1, 2] } as never),
    ).rejects.toMatchObject({ code: "DUPLICATE_BATTERY_CODE" });
  });

  it("adds and removes members", async () => {
    repository.getById.mockResolvedValue({
      id: 1,
      owner_party_id: 1,
      members: [{ id: 1 }, { id: 2 }],
    });
    repository.getCylinderPackInfo.mockResolvedValue(null);
    await expect(
      service.addMember(user, 1, { cylinder_id: 99 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.getCylinderPackInfo.mockResolvedValue(packInfo());
    repository.addMember.mockResolvedValue({ id: 1 });
    await expect(
      service.addMember(user, 1, { cylinder_id: 99 }),
    ).resolves.toMatchObject({ id: 1 });

    // Removing when only 2 members would leave 1 → too few.
    await expect(service.removeMember(user, 1, 2)).rejects.toBeInstanceOf(
      ApiError,
    );

    repository.getById.mockResolvedValue({
      id: 1,
      owner_party_id: 1,
      members: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    repository.removeMember.mockResolvedValue({ id: 1 });
    await expect(service.removeMember(user, 1, 3)).resolves.toMatchObject({
      id: 1,
    });
  });

  it("fills and empties stock batteries", async () => {
    repository.getById.mockResolvedValue(null);
    await expect(service.fill(user, 1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getById.mockResolvedValue({
      id: 1,
      state: "IN_STOCK_FULL",
      version: 2,
    });
    await expect(service.fill(user, 1)).rejects.toBeInstanceOf(ApiError);

    repository.getById.mockResolvedValue({
      id: 1,
      state: "IN_STOCK_EMPTY",
      version: 2,
    });
    await expect(service.fill(user, 1, 1)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });

    repository.fill.mockResolvedValue({
      id: 1,
      state: "IN_STOCK_FULL",
      version: 3,
    });
    await expect(service.fill(user, 1, 2)).resolves.toMatchObject({
      state: "IN_STOCK_FULL",
    });
    expect(repository.fill).toHaveBeenCalledWith(1, user.id, 2);

    repository.getById.mockResolvedValue({
      id: 1,
      state: "IN_STOCK_EMPTY",
      version: 2,
    });
    await expect(service.empty(user, 1)).rejects.toBeInstanceOf(ApiError);

    repository.getById.mockResolvedValue({
      id: 1,
      state: "IN_STOCK_FULL",
      version: 2,
    });
    await expect(service.empty(user, 1, 1)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });

    repository.empty.mockResolvedValue({
      id: 1,
      state: "IN_STOCK_EMPTY",
      version: 3,
    });
    await expect(service.empty(user, 1, 2)).resolves.toMatchObject({
      state: "IN_STOCK_EMPTY",
    });
    expect(repository.empty).toHaveBeenCalledWith(1, user.id, 2);
  });
});

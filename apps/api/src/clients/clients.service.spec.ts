import { principal } from "../test-utils/fixtures";
import { ClientsService } from "./clients.service";

function client(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    version: 2,
    name: "Hospital",
    ...overrides,
  };
}

describe("ClientsService", () => {
  const repository = {
    list: vi.fn(),
    getById: vi.fn(),
    getAccount: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  const service = new ClientsService(repository as never);

  beforeEach(() => vi.clearAllMocks());

  it("lists with territory scope for clerks", async () => {
    repository.list.mockResolvedValue({ data: [] });
    const user = principal();
    await service.list(user, { limit: 10 } as never);
    expect(repository.list).toHaveBeenCalledWith({
      query: { limit: 10 },
      territoryIds: [10],
      roles: ["CLERK"],
    });
  });

  it("gets client and account or not found", async () => {
    const user = principal({ roles: ["ADMIN"], territories: [] });
    repository.getById.mockResolvedValue(null);
    await expect(service.getById(user, 1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getById.mockResolvedValue(client());
    expect(await service.getById(user, 3)).toMatchObject({ id: 3 });

    repository.getAccount.mockResolvedValue(null);
    await expect(
      service.getAccount(user, 1, {} as never),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    repository.getAccount.mockResolvedValue({ client: client(), lines: [] });
    expect(await service.getAccount(user, 3, {} as never)).toMatchObject({
      lines: [],
    });
  });

  it("creates and updates with rate permission checks", async () => {
    const clerk = principal();
    repository.create.mockResolvedValue(client());
    await service.create(clerk, { name: "X" } as never);

    repository.getById.mockResolvedValue(client());
    await expect(
      service.update(clerk, 3, { daily_rate_default: 10 } as never),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const billing = principal({ roles: ["BILLING"] });
    repository.getById.mockResolvedValue(client());
    repository.update.mockResolvedValue(client());
    await service.update(billing, 3, { daily_rate_default: 10 } as never);

    repository.getById.mockResolvedValue(client({ version: 2 }));
    await expect(
      service.update(billing, 3, { name: "Y" } as never, 1),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("restricts delete to admin and checks version", async () => {
    const clerk = principal();
    await expect(service.remove(clerk, 3)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const admin = principal({ roles: ["ADMIN"] });
    repository.getById.mockResolvedValue(client({ version: 2 }));
    await expect(service.remove(admin, 3, 1)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });

    repository.getById.mockResolvedValue(client({ version: 2 }));
    repository.softDelete.mockResolvedValue(undefined);
    await service.remove(admin, 3, 2);
    expect(repository.softDelete).toHaveBeenCalledWith(3, admin.id, 2);
  });
});

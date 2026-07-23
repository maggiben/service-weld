import { ApiError } from "../common/errors/api-error";
import { principal } from "../test-utils/fixtures";
import { CylindersService } from "./cylinders.service";

function cyl(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    serial_number: "S-1",
    ownership_basis: "OURS",
    state: "IN_STOCK_FULL",
    packaging: "SINGLE",
    gas_code: "O2",
    version: 1,
    ...overrides,
  };
}

describe("CylindersService", () => {
  const repository = {
    list: jest.fn(),
    getById: jest.fn(),
    listHistory: jest.fn(),
    getOwnerPartyType: jest.fn(),
    gasExists: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    reportLoss: jest.fn(),
    updateState: jest.fn(),
    fill: jest.fn(),
    empty: jest.fn(),
  };
  const movementsRepository = {
    hasOpenMovement: jest.fn(),
    findOpenIdByCylinder: jest.fn(),
    createDelivery: jest.fn(),
  };
  const service = new CylindersService(
    repository as never,
    movementsRepository as never,
  );
  const user = principal();

  beforeEach(() => jest.clearAllMocks());

  it("lists, gets, and history", async () => {
    repository.list.mockResolvedValue({ data: [] });
    expect(await service.list({} as never)).toEqual({ data: [] });

    repository.getById.mockResolvedValue(null);
    await expect(service.getById(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.listHistory.mockResolvedValue(null);
    await expect(service.getHistory(1, {} as never)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    repository.listHistory.mockResolvedValue({ data: [] });
    expect(await service.getHistory(1, {} as never)).toEqual({ data: [] });
  });

  it("creates with owner/gas validation", async () => {
    const input = {
      owner_party_id: 1,
      ownership_basis: "OURS",
      serial_number: "S-1",
      gas_code: "O2",
    };
    repository.getOwnerPartyType.mockResolvedValue(null);
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    repository.getOwnerPartyType.mockResolvedValue("SELF");
    repository.gasExists.mockResolvedValue(false);
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    repository.gasExists.mockResolvedValue(true);
    repository.create.mockResolvedValue(cyl());
    await expect(service.create(user, input as never)).resolves.toMatchObject({
      id: 5,
    });
  });

  it("updates with version and gas checks", async () => {
    repository.getById.mockResolvedValue(null);
    await expect(
      service.update(user, 1, { gas_code: "O2" } as never),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.getById.mockResolvedValue(
      cyl({ state: "AT_CLIENT", version: 2 }),
    );
    await expect(
      service.update(user, 5, { gas_code: "O2" } as never, 2),
    ).rejects.toMatchObject({ code: "CYLINDER_HELD_BY_CLIENT" });

    repository.getById.mockResolvedValue(cyl({ version: 2 }));
    repository.gasExists.mockResolvedValue(false);
    await expect(
      service.update(user, 5, { gas_code: "XX" } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.gasExists.mockResolvedValue(true);
    await expect(
      service.update(user, 5, { note: "x" } as never, 1),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    repository.update.mockResolvedValue(cyl({ version: 3 }));
    await expect(
      service.update(user, 5, { note: "x" } as never, 2),
    ).resolves.toMatchObject({ version: 3 });
  });

  it("fills empty stock cylinders", async () => {
    repository.getById.mockResolvedValue(null);
    await expect(service.fill(user, 1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getById.mockResolvedValue(cyl({ state: "IN_STOCK_FULL" }));
    await expect(service.fill(user, 5)).rejects.toMatchObject({
      code: "ILLEGAL_STATE_TRANSITION",
    });

    repository.getById.mockResolvedValue(
      cyl({ state: "IN_STOCK_EMPTY", version: 2 }),
    );
    await expect(service.fill(user, 5, 1)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });

    repository.getById.mockResolvedValue(
      cyl({ state: "IN_STOCK_EMPTY", version: 2 }),
    );
    repository.fill.mockResolvedValue(
      cyl({ state: "IN_STOCK_FULL", condition: "FULL", version: 3 }),
    );
    await expect(service.fill(user, 5, 2)).resolves.toMatchObject({
      state: "IN_STOCK_FULL",
      condition: "FULL",
    });
    expect(repository.fill).toHaveBeenCalledWith(5, user.id, 2);
  });

  it("empties full stock cylinders", async () => {
    repository.getById.mockResolvedValue(null);
    await expect(service.empty(user, 1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getById.mockResolvedValue(cyl({ state: "IN_STOCK_EMPTY" }));
    await expect(service.empty(user, 5)).rejects.toMatchObject({
      code: "ILLEGAL_STATE_TRANSITION",
    });

    repository.getById.mockResolvedValue(
      cyl({ state: "IN_STOCK_FULL", version: 2 }),
    );
    await expect(service.empty(user, 5, 1)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });

    repository.getById.mockResolvedValue(
      cyl({ state: "IN_STOCK_FULL", version: 2 }),
    );
    repository.empty.mockResolvedValue(
      cyl({ state: "IN_STOCK_EMPTY", condition: "EMPTY", version: 3 }),
    );
    await expect(service.empty(user, 5, 2)).resolves.toMatchObject({
      state: "IN_STOCK_EMPTY",
      condition: "EMPTY",
    });
    expect(repository.empty).toHaveBeenCalledWith(5, user.id, 2);
  });

  it("reports loss and raises supplier alert when needed", async () => {
    repository.getById.mockResolvedValue(null);
    await expect(
      service.reportLoss(user, 1, {
        outcome: "LOST",
        occurred_on: "2026-06-01",
      } as never),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.getById.mockResolvedValue(cyl({ state: "AT_CLIENT" }));
    repository.getOwnerPartyType.mockResolvedValue(null);
    await expect(
      service.reportLoss(user, 5, {
        outcome: "LOST",
        occurred_on: "2026-06-01",
        client_party_id: 9,
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.getById.mockResolvedValue(
      cyl({ state: "AT_CLIENT", ownership_basis: "SUPPLIER" }),
    );
    repository.reportLoss.mockResolvedValue({
      cylinder: cyl({ state: "LOST" }),
      alert: {
        id: 1n,
        alert_type: "SUPPLIER_LOSS",
        entity_table: "cylinder",
        entity_id: 5n,
        severity: 2n,
        created_at: new Date("2026-06-01T00:00:00Z"),
        resolved_at: null,
        assigned_role: "MANAGER",
      },
    });
    const result = await service.reportLoss(user, 5, {
      outcome: "LOST",
      occurred_on: "2026-06-01",
    } as never);
    expect(result.alert?.id).toBe(1);
    expect(repository.reportLoss).toHaveBeenCalledWith(
      expect.objectContaining({ raiseSupplierAlert: true }),
    );
  });

  it("replaces lost cylinders with stock units", async () => {
    repository.getById.mockResolvedValueOnce(null);
    await expect(
      service.replace(user, 1, {
        replacement_cylinder_id: 2,
        client_party_id: 3,
        occurred_on: "2026-06-01",
      } as never),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.getById
      .mockResolvedValueOnce(cyl({ id: 1, state: "LOST", version: 1 }))
      .mockResolvedValueOnce(null);
    await expect(
      service.replace(user, 1, {
        replacement_cylinder_id: 2,
        client_party_id: 3,
        occurred_on: "2026-06-01",
      } as never),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.getById
      .mockResolvedValueOnce(cyl({ id: 1, state: "LOST", version: 1 }))
      .mockResolvedValueOnce(
        cyl({ id: 2, state: "IN_STOCK_FULL", ownership_basis: "OURS" }),
      );
    movementsRepository.hasOpenMovement.mockResolvedValue(true);
    await expect(
      service.replace(user, 1, {
        replacement_cylinder_id: 2,
        client_party_id: 3,
        occurred_on: "2026-06-01",
      } as never),
    ).rejects.toMatchObject({ code: "REPLACEMENT_NOT_AVAILABLE" });

    movementsRepository.hasOpenMovement.mockResolvedValue(false);
    movementsRepository.findOpenIdByCylinder.mockResolvedValue(null);
    movementsRepository.createDelivery.mockResolvedValue({
      id: 10,
      cylinder_id: 2,
      holder_party_id: 3,
      state: "OPEN",
    });
    repository.getById
      .mockResolvedValueOnce(cyl({ id: 1, state: "LOST", version: 1 }))
      .mockResolvedValueOnce(
        cyl({ id: 2, state: "IN_STOCK_FULL", ownership_basis: "OURS" }),
      )
      .mockResolvedValueOnce(cyl({ id: 1, state: "LOST" }));
    const replaced = await service.replace(user, 1, {
      replacement_cylinder_id: 2,
      client_party_id: 3,
      occurred_on: "2026-06-01",
    } as never);
    expect(replaced.replacement_movement.id).toBe(10);

    // Open movement on original → report loss; CUSTOMER replacement → REFILL.
    repository.getById
      .mockResolvedValueOnce(
        cyl({ id: 1, state: "AT_CLIENT", version: 1, serial_number: "OLD" }),
      )
      .mockResolvedValueOnce(
        cyl({
          id: 2,
          state: "IN_STOCK_FULL",
          ownership_basis: "CUSTOMER",
          gas_code: "O2",
        }),
      )
      .mockResolvedValueOnce(cyl({ id: 1, state: "LOST" }));
    movementsRepository.findOpenIdByCylinder.mockResolvedValue(40);
    repository.reportLoss.mockResolvedValue({
      cylinder: cyl({ state: "LOST" }),
      alert: null,
    });
    await service.replace(user, 1, {
      replacement_cylinder_id: 2,
      client_party_id: 3,
      occurred_on: "2026-06-01",
    } as never);
    expect(repository.reportLoss).toHaveBeenCalled();
    expect(movementsRepository.createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ movement_kind: "REFILL" }),
      "CUSTOMER",
      "O2",
      user.id,
    );

    // Non-terminal original without open movement → retire.
    repository.getById
      .mockResolvedValueOnce(
        cyl({ id: 1, state: "AT_CLIENT", version: 1, serial_number: "OLD" }),
      )
      .mockResolvedValueOnce(
        cyl({ id: 2, state: "IN_STOCK_EMPTY", ownership_basis: "OURS" }),
      )
      .mockResolvedValueOnce(cyl({ id: 1, state: "RETIRED" }));
    movementsRepository.findOpenIdByCylinder.mockResolvedValue(null);
    await service.replace(user, 1, {
      replacement_cylinder_id: 2,
      client_party_id: 3,
      occurred_on: "2026-06-01",
    } as never);
    expect(repository.updateState).toHaveBeenCalledWith(
      1,
      "RETIRED",
      "EMPTY",
      user.id,
    );

    repository.getById
      .mockResolvedValueOnce(cyl({ id: 1, state: "LOST", version: 2 }))
      .mockResolvedValueOnce(cyl({ id: 2, state: "IN_STOCK_FULL" }));
    await expect(
      service.replace(
        user,
        1,
        {
          replacement_cylinder_id: 2,
          client_party_id: 3,
          occurred_on: "2026-06-01",
        } as never,
        1,
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("maps domain errors on bad create capacity", async () => {
    repository.getOwnerPartyType.mockResolvedValue("SELF");
    await expect(
      service.create(user, {
        owner_party_id: 1,
        ownership_basis: "OURS",
        serial_number: "S",
        capacity_m3: -1,
      } as never),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

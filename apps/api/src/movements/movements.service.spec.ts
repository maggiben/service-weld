import { ApiError } from "../common/errors/api-error";
import { principal } from "../test-utils/fixtures";
import { MovementsService } from "./movements.service";

function cylinder(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    ownership_basis: "OURS",
    state: "IN_STOCK_FULL",
    packaging: "SINGLE",
    gas_code: "O2",
    ...overrides,
  };
}

function movement(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    cylinder_id: 5,
    holder_party_id: 2,
    state: "OPEN",
    movement_kind: "RENTAL",
    property_basis: "OURS",
    gas_code: "O2",
    delivery_date: "2026-06-01",
    version: 1,
    ...overrides,
  };
}

describe("MovementsService", () => {
  const repository = {
    list: vi.fn(),
    getById: vi.fn(),
    getCylinderForDelivery: vi.fn(),
    holderExists: vi.fn(),
    hasOpenMovement: vi.fn(),
    createDelivery: vi.fn(),
    createSale: vi.fn(),
    closeReturn: vi.fn(),
    closeRefill: vi.fn(),
    swapReturn: vi.fn(),
    voidMovement: vi.fn(),
  };
  const billingLookup = {
    movementHasLockedCharges: vi.fn(),
    cylinderSaleHasLockedCharges: vi.fn(),
  };
  const service = new MovementsService(
    repository as never,
    billingLookup as never,
  );
  const user = principal();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists and gets by id", async () => {
    repository.list.mockResolvedValue({ data: [] });
    expect(await service.list({} as never)).toEqual({ data: [] });

    repository.getById.mockResolvedValue(null);
    await expect(service.getById(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getById.mockResolvedValue(movement());
    expect(await service.getById(9)).toMatchObject({ id: 9 });
  });

  describe("create", () => {
    const input = {
      cylinder_id: 5,
      holder_party_id: 2,
      movement_kind: "RENTAL" as const,
      delivery_date: "2026-06-01",
    };

    it("validates cylinder, holder, open movement, and creates", async () => {
      repository.getCylinderForDelivery.mockResolvedValue(null);
      await expect(service.create(user, input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      repository.getCylinderForDelivery.mockResolvedValue(cylinder());
      repository.holderExists.mockResolvedValue(false);
      await expect(service.create(user, input)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });

      repository.holderExists.mockResolvedValue(true);
      repository.hasOpenMovement.mockResolvedValue(true);
      await expect(service.create(user, input)).rejects.toMatchObject({
        code: "CYLINDER_ALREADY_OUT",
      });

      repository.hasOpenMovement.mockResolvedValue(false);
      repository.createDelivery.mockResolvedValue(movement());
      await expect(service.create(user, input)).resolves.toMatchObject({
        id: 9,
      });
      expect(repository.createDelivery).toHaveBeenCalledWith(
        input,
        "OURS",
        "O2",
        user.id,
      );
    });

    it("validates origin party when provided", async () => {
      repository.getCylinderForDelivery.mockResolvedValue(cylinder());
      repository.holderExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      await expect(
        service.create(user, { ...input, origin_party_id: 99 }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("maps domain deliverability failures", async () => {
      repository.getCylinderForDelivery.mockResolvedValue(
        cylinder({ state: "LOST" }),
      );
      repository.holderExists.mockResolvedValue(true);
      repository.hasOpenMovement.mockResolvedValue(false);
      await expect(service.create(user, input)).rejects.toBeInstanceOf(
        ApiError,
      );
    });

    it("maps exclusion violations on create", async () => {
      repository.getCylinderForDelivery.mockResolvedValue(cylinder());
      repository.holderExists.mockResolvedValue(true);
      repository.hasOpenMovement.mockResolvedValue(false);
      repository.createDelivery.mockRejectedValue({ code: "23P01" });
      await expect(service.create(user, input)).rejects.toMatchObject({
        code: "CYLINDER_ALREADY_OUT",
      });
    });

    it("sells an in-stock cylinder via createSale", async () => {
      const saleInput = {
        ...input,
        movement_kind: "SALE" as const,
        sale_price: 12500.5,
      };
      const cyl = cylinder({ capacity_m3: 10, capacity_unit: "M3" });
      repository.getCylinderForDelivery.mockResolvedValue(cyl);
      repository.holderExists.mockResolvedValue(true);
      repository.hasOpenMovement.mockResolvedValue(false);
      repository.createSale.mockResolvedValue(
        movement({ movement_kind: "SALE", state: "SOLD" }),
      );
      await expect(service.create(user, saleInput)).resolves.toMatchObject({
        state: "SOLD",
      });
      expect(repository.createSale).toHaveBeenCalledWith(
        saleInput,
        cyl,
        "O2",
        user.id,
      );
      expect(repository.createDelivery).not.toHaveBeenCalled();
    });

    it("rejects selling a supplier-owned cylinder", async () => {
      repository.getCylinderForDelivery.mockResolvedValue(
        cylinder({ ownership_basis: "SUPPLIER" }),
      );
      repository.holderExists.mockResolvedValue(true);
      repository.hasOpenMovement.mockResolvedValue(false);
      await expect(
        service.create(user, {
          ...input,
          movement_kind: "SALE" as const,
          sale_price: 1000,
        }),
      ).rejects.toMatchObject({ code: "KIND_BASIS_MISMATCH" });
    });
  });

  describe("returnMovement", () => {
    const input = { return_date: "2026-06-08" };

    it("rejects missing, closed, closes customer refill and rental", async () => {
      repository.getById.mockResolvedValue(null);
      await expect(
        service.returnMovement(user, 1, input),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      repository.getById.mockResolvedValue(movement({ state: "CLOSED" }));
      await expect(
        service.returnMovement(user, 1, input),
      ).rejects.toMatchObject({ code: "NOT_OPEN" });

      // Customer-owned / REFILL closes the fill cycle (unit stays with client).
      repository.getById.mockResolvedValue(
        movement({ property_basis: "CUSTOMER", movement_kind: "REFILL" }),
      );
      repository.closeRefill.mockResolvedValue(
        movement({ state: "CLOSED", movement_kind: "REFILL" }),
      );
      await expect(
        service.returnMovement(user, 1, input),
      ).resolves.toMatchObject({ state: "CLOSED" });

      repository.getById.mockResolvedValue(movement());
      repository.closeReturn.mockResolvedValue(movement({ state: "CLOSED" }));
      await expect(
        service.returnMovement(user, 9, input, 1),
      ).resolves.toMatchObject({
        state: "CLOSED",
      });
    });
  });

  describe("swap", () => {
    const input = {
      returned_cylinder_id: 7,
      return_date: "2026-06-08",
    };

    it("validates open state, distinct cylinder, availability, and swaps", async () => {
      repository.getById.mockResolvedValue(null);
      await expect(service.swap(user, 1, input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      repository.getById.mockResolvedValue(movement({ state: "CLOSED" }));
      await expect(service.swap(user, 1, input)).rejects.toMatchObject({
        code: "NOT_OPEN",
      });

      repository.getById.mockResolvedValue(movement());
      await expect(
        service.swap(user, 9, { ...input, returned_cylinder_id: 5 }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

      repository.getCylinderForDelivery.mockResolvedValue(null);
      await expect(service.swap(user, 9, input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      repository.getCylinderForDelivery.mockResolvedValue(
        cylinder({ id: 7, ownership_basis: "OURS" }),
      );
      repository.hasOpenMovement.mockResolvedValue(true);
      await expect(service.swap(user, 9, input)).rejects.toMatchObject({
        code: "RETURNED_CYLINDER_BUSY",
      });

      repository.hasOpenMovement.mockResolvedValue(false);
      repository.swapReturn.mockResolvedValue(movement({ id: 10 }));
      await expect(service.swap(user, 9, input)).resolves.toMatchObject({
        id: 10,
      });
    });

    it("maps exclusion violations on swap", async () => {
      repository.getById.mockResolvedValue(movement());
      repository.getCylinderForDelivery.mockResolvedValue(cylinder({ id: 7 }));
      repository.hasOpenMovement.mockResolvedValue(false);
      repository.swapReturn.mockRejectedValue({ code: "23P01" });
      await expect(service.swap(user, 9, input)).rejects.toMatchObject({
        code: "CYLINDER_ALREADY_OUT",
      });
    });
  });

  describe("void", () => {
    it("rejects missing, already void, billed, and voids otherwise", async () => {
      repository.getById.mockResolvedValue(null);
      await expect(
        service.void(user, 1, { reason: "mistake" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      repository.getById.mockResolvedValue(movement({ state: "VOID" }));
      await expect(
        service.void(user, 1, { reason: "mistake" }),
      ).rejects.toMatchObject({ code: "ALREADY_VOID" });

      repository.getById.mockResolvedValue(movement());
      billingLookup.movementHasLockedCharges.mockResolvedValue(true);
      await expect(
        service.void(user, 9, { reason: "mistake" }),
      ).rejects.toMatchObject({ code: "ALREADY_BILLED" });

      billingLookup.movementHasLockedCharges.mockResolvedValue(false);
      repository.voidMovement.mockResolvedValue(movement({ state: "VOID" }));
      await expect(
        service.void(user, 9, { reason: "mistake" }),
      ).resolves.toMatchObject({ state: "VOID" });
      expect(repository.voidMovement).toHaveBeenCalledWith(
        9,
        5,
        true,
        "mistake",
        1,
        user.id,
        { restoreSold: false },
      );
    });

    it("voids a sale when the cylinder_sale is not locked", async () => {
      repository.getById.mockResolvedValue(
        movement({ movement_kind: "SALE", state: "SOLD" }),
      );
      billingLookup.movementHasLockedCharges.mockResolvedValue(false);
      billingLookup.cylinderSaleHasLockedCharges.mockResolvedValue(false);
      repository.voidMovement.mockResolvedValue(
        movement({ movement_kind: "SALE", state: "VOID" }),
      );
      await expect(
        service.void(user, 9, { reason: "wrong price" }),
      ).resolves.toMatchObject({ state: "VOID" });
      expect(billingLookup.cylinderSaleHasLockedCharges).toHaveBeenCalledWith(
        5,
      );
      expect(repository.voidMovement).toHaveBeenCalledWith(
        9,
        5,
        false,
        "wrong price",
        1,
        user.id,
        { restoreSold: true },
      );
    });

    it("rejects voiding a billed sale", async () => {
      repository.getById.mockResolvedValue(
        movement({ movement_kind: "SALE", state: "SOLD" }),
      );
      billingLookup.movementHasLockedCharges.mockResolvedValue(false);
      billingLookup.cylinderSaleHasLockedCharges.mockResolvedValue(true);
      await expect(
        service.void(user, 9, { reason: "mistake" }),
      ).rejects.toMatchObject({ code: "ALREADY_BILLED" });
      expect(repository.voidMovement).not.toHaveBeenCalled();
    });
  });
});

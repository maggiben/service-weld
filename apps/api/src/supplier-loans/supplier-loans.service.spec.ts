import { ApiError } from "../common/errors/api-error";
import { principal } from "../test-utils/fixtures";
import { SupplierLoansService } from "./supplier-loans.service";

describe("SupplierLoansService", () => {
  const repository = {
    list: jest.fn(),
    getById: jest.fn(),
    getPartyType: jest.fn(),
    getCylinder: jest.fn(),
    create: jest.fn(),
    clientExists: jest.fn(),
    advance: jest.fn(),
  };
  const service = new SupplierLoansService(repository as never);
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

  it("creates only for supplier parties and non-terminal cylinders", async () => {
    const input = {
      supplier_party_id: 1,
      cylinder_id: 2,
      received_from_supplier: "2026-06-01",
    };
    repository.getPartyType.mockResolvedValue("CLIENT");
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    repository.getPartyType.mockResolvedValue("SUPPLIER");
    repository.getCylinder.mockResolvedValue(null);
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getCylinder.mockResolvedValue({
      id: 2,
      state: "LOST",
      gas_code: "O2",
    });
    await expect(service.create(user, input as never)).rejects.toMatchObject({
      code: "CYLINDER_TERMINAL",
    });

    repository.getCylinder.mockResolvedValue({
      id: 2,
      state: "IN_STOCK_FULL",
      gas_code: "O2",
    });
    repository.create.mockResolvedValue({ id: 9 });
    await expect(service.create(user, input as never)).resolves.toMatchObject({
      id: 9,
    });
  });

  it("advances stages with client and version checks", async () => {
    repository.getById.mockResolvedValue({
      id: 1,
      stage: "RECEIVED",
      version: 2,
      received_from_supplier: "2026-06-01",
      delivered_to_client: null,
      returned_by_client: null,
      returned_to_supplier: null,
    });

    await expect(
      service.advance(user, 1, {
        stage: "OUT_TO_CLIENT",
        date: "2026-06-08",
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.clientExists.mockResolvedValue(false);
    await expect(
      service.advance(user, 1, {
        stage: "OUT_TO_CLIENT",
        date: "2026-06-08",
        client_party_id: 3,
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    repository.clientExists.mockResolvedValue(true);
    await expect(
      service.advance(
        user,
        1,
        {
          stage: "OUT_TO_CLIENT",
          date: "2026-06-08",
          client_party_id: 3,
        } as never,
        1,
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    repository.advance.mockResolvedValue({ id: 1, stage: "OUT_TO_CLIENT" });
    await expect(
      service.advance(user, 1, {
        stage: "OUT_TO_CLIENT",
        date: "2026-06-08",
        client_party_id: 3,
      } as never),
    ).resolves.toMatchObject({ stage: "OUT_TO_CLIENT" });
  });

  it("maps domain stage errors", async () => {
    repository.getById.mockResolvedValue({
      id: 1,
      stage: "RETURNED_TO_SUPPLIER",
      version: 1,
      received_from_supplier: "2026-06-01",
      delivered_to_client: "2026-06-02",
      returned_by_client: "2026-06-03",
      returned_to_supplier: "2026-06-04",
    });
    await expect(
      service.advance(user, 1, {
        stage: "OUT_TO_CLIENT",
        date: "2026-06-08",
        client_party_id: 3,
      } as never),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

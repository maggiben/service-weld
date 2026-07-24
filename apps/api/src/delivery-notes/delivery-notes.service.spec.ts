import { ApiError } from "../common/errors/api-error";
import { DeliveryNotesService } from "./delivery-notes.service";

describe("DeliveryNotesService", () => {
  const repository = {
    list: jest.fn(),
    getById: jest.fn(),
    getDetail: jest.fn(),
    create: jest.fn(),
  };
  const service = new DeliveryNotesService(repository as never);

  beforeEach(() => jest.clearAllMocks());

  it("lists notes", async () => {
    repository.list.mockResolvedValue({ data: [], page: {} });
    await expect(service.list({} as never)).resolves.toEqual({
      data: [],
      page: {},
    });
  });

  it("gets by id or 404", async () => {
    repository.getDetail.mockResolvedValue(null);
    await expect(service.getById(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getDetail.mockResolvedValue({
      id: 1,
      remito_number: "1475",
      movements: [],
      accessory_rentals: [],
    });
    await expect(service.getById(1)).resolves.toMatchObject({
      remito_number: "1475",
    });
  });

  it("creates and surfaces duplicate as conflict", async () => {
    repository.create.mockResolvedValue({ id: 9, remito_number: "1475" });
    await expect(
      service.create({ remito_number: "1475" } as never),
    ).resolves.toMatchObject({ id: 9 });

    repository.create.mockRejectedValue(
      new ApiError("DUPLICATE_REMITO", "dup", 409),
    );
    await expect(
      service.create({ remito_number: "1475" } as never),
    ).rejects.toMatchObject({ code: "DUPLICATE_REMITO" });
  });
});

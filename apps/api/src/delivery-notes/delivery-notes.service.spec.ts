import { ApiError } from "../common/errors/api-error";
import { DeliveryNotesService } from "./delivery-notes.service";

describe("DeliveryNotesService", () => {
  const repository = {
    list: vi.fn(),
    getById: vi.fn(),
    getDetail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    transition: vi.fn(),
    countLines: vi.fn(),
    listLines: vi.fn(),
    setPickingStatus: vi.fn(),
    addLine: vi.fn(),
    updateLine: vi.fn(),
    softDeleteLine: vi.fn(),
    linkLineMovement: vi.fn(),
    linkLineAccessoryRental: vi.fn(),
    addIncident: vi.fn(),
    updateIncident: vi.fn(),
    nextReprintSeq: vi.fn(),
    getClientFiscal: vi.fn(),
    logPrint: vi.fn(),
  };
  const movements = {
    create: vi.fn(),
    returnMovement: vi.fn(),
    findOpenIdByCylinder: vi.fn(),
  };
  const accessories = {
    createRental: vi.fn(),
    returnRental: vi.fn(),
    findOpenRentalIdByAccessory: vi.fn(),
  };
  const service = new DeliveryNotesService(
    repository as never,
    movements as never,
    accessories as never,
  );
  const principal = { id: 7 } as never;

  beforeEach(() => vi.clearAllMocks());

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
      service.create(principal, { remito_number: "1475" } as never),
    ).resolves.toMatchObject({ id: 9 });

    repository.create.mockRejectedValue(
      new ApiError("DUPLICATE_REMITO", "dup", 409),
    );
    await expect(
      service.create(principal, { remito_number: "1475" } as never),
    ).rejects.toMatchObject({ code: "DUPLICATE_REMITO" });
  });

  it("prepares a draft remito with lines", async () => {
    repository.getById.mockResolvedValue({
      id: 1,
      status: "DRAFT",
      remito_type: "DELIVERY",
      client_party_id: 3,
      scheduled_delivery_at: null,
      version: 1,
    });
    repository.countLines.mockResolvedValue(2);
    repository.transition.mockResolvedValue({ id: 1, status: "PREPARED" });
    await expect(
      service.transition(principal, 1, "prepare", { version: 1 }),
    ).resolves.toMatchObject({ status: "PREPARED" });
    expect(repository.countLines).toHaveBeenCalledWith(1);
  });

  it("rejects prepare without lines", async () => {
    repository.getById.mockResolvedValue({
      id: 1,
      status: "DRAFT",
      remito_type: "DELIVERY",
      client_party_id: 3,
      scheduled_delivery_at: null,
      version: 1,
    });
    repository.countLines.mockResolvedValue(0);
    await expect(
      service.transition(principal, 1, "prepare", { version: 1 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it("rejects assign without schedule", async () => {
    repository.getById.mockResolvedValue({
      id: 1,
      status: "PREPARED",
      remito_type: "DELIVERY",
      client_party_id: 3,
      scheduled_delivery_at: null,
      version: 1,
    });
    await expect(
      service.transition(principal, 1, "assign", {
        version: 1,
        driver_id: 2,
      }),
    ).rejects.toMatchObject({ code: "REMITO_ASSIGN_REQUIRES_SCHEDULE" });
  });

  it("on close posts RENTAL movement and links the line", async () => {
    repository.getById.mockResolvedValue({
      id: 10,
      status: "SIGNED",
      remito_type: "RENTAL_DELIVERY",
      client_party_id: 3,
      issued_date: "2026-07-01",
      arrival_at: "2026-07-02T15:00:00.000Z",
      version: 4,
    });
    repository.listLines.mockResolvedValue([
      {
        id: 100,
        line_no: 1,
        item_kind: "CYLINDER",
        cylinder_id: 55,
        accessory_id: null,
        is_rental: true,
        ownership_basis: "OURS",
        gas_code: "O2",
        notes: null,
        movement_event_id: null,
        accessory_rental_id: null,
        qty: 1,
      },
    ]);
    movements.create.mockResolvedValue({ id: 900 });
    repository.transition.mockResolvedValue({ id: 10, status: "CLOSED" });

    await expect(
      service.transition(principal, 10, "close", { version: 4 }),
    ).resolves.toMatchObject({ status: "CLOSED" });

    expect(movements.create).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({
        cylinder_id: 55,
        holder_party_id: 3,
        movement_kind: "RENTAL",
        delivery_date: "2026-07-02",
        remito_id: 10,
      }),
    );
    expect(repository.linkLineMovement).toHaveBeenCalledWith(10, 100, 900);
    expect(repository.transition).toHaveBeenCalled();
  });

  it("on close returns open movement for return-like remito", async () => {
    repository.getById.mockResolvedValue({
      id: 11,
      status: "SIGNED",
      remito_type: "CYLINDER_RETURN",
      client_party_id: 3,
      issued_date: "2026-07-10",
      arrival_at: null,
      version: 2,
    });
    repository.listLines.mockResolvedValue([
      {
        id: 101,
        line_no: 1,
        item_kind: "CYLINDER",
        cylinder_id: 55,
        accessory_id: null,
        is_rental: true,
        ownership_basis: "OURS",
        gas_code: null,
        notes: null,
        movement_event_id: null,
        accessory_rental_id: null,
        qty: 1,
      },
    ]);
    movements.findOpenIdByCylinder.mockResolvedValue(77);
    movements.returnMovement.mockResolvedValue({ id: 77 });
    repository.transition.mockResolvedValue({ id: 11, status: "CLOSED" });

    await expect(
      service.transition(principal, 11, "close", { version: 2 }),
    ).resolves.toMatchObject({ status: "CLOSED" });

    expect(movements.returnMovement).toHaveBeenCalledWith(principal, 77, {
      return_date: "2026-07-10",
    });
    expect(repository.linkLineMovement).toHaveBeenCalledWith(11, 101, 77);
  });

  const printableDetail = {
    id: 20,
    remito_number: "A-00000020",
    remito_type: "DELIVERY",
    status: "SIGNED",
    issued_date: "2026-07-01",
    scheduled_delivery_at: null,
    observations: null,
    driver_name: null,
    helper_name: null,
    vehicle_plate: null,
    origin_warehouse_name: null,
    client_party_id: 5,
    client_name: "Acme SA",
    version: 3,
    lines: [],
    movements: [],
    accessory_rentals: [],
  } as never;

  it("prints an original PDF for a principal with pdf capability", async () => {
    repository.getDetail.mockResolvedValue(printableDetail);
    repository.getClientFiscal.mockResolvedValue({
      name: "Acme SA",
      cuit: "30-71234567-8",
      address: "Calle Falsa 123",
    });
    repository.logPrint.mockResolvedValue(undefined);

    const printer = { id: 3, capabilities: ["delivery_notes:pdf"] } as never;
    const result = await service.printPdf(printer, 20, {
      copy: "ORIGINAL",
    } as never);

    expect(result.buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(repository.nextReprintSeq).not.toHaveBeenCalled();
    expect(repository.logPrint).toHaveBeenCalledWith(
      expect.objectContaining({ remitoId: 20, copyKind: "ORIGINAL" }),
    );
  });

  it("rejects an original print without the pdf capability", async () => {
    repository.getDetail.mockResolvedValue(printableDetail);
    const printer = { id: 3, capabilities: [] } as never;
    await expect(
      service.printPdf(printer, 20, { copy: "ORIGINAL" } as never),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a reprint without the reprint capability", async () => {
    repository.getDetail.mockResolvedValue(printableDetail);
    const printer = { id: 3, capabilities: ["delivery_notes:pdf"] } as never;
    await expect(
      service.printPdf(printer, 20, {
        copy: "REIMPRESION",
        reason: "Copia perdida",
      } as never),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a reprint without a reason", async () => {
    repository.getDetail.mockResolvedValue(printableDetail);
    const printer = {
      id: 3,
      capabilities: ["delivery_notes:pdf:reprint"],
    } as never;
    await expect(
      service.printPdf(printer, 20, { copy: "REIMPRESION" } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("prints a reprint with sequence and reason", async () => {
    repository.getDetail.mockResolvedValue(printableDetail);
    repository.nextReprintSeq.mockResolvedValue(2);
    repository.getClientFiscal.mockResolvedValue(null);
    repository.logPrint.mockResolvedValue(undefined);
    const printer = {
      id: 3,
      capabilities: ["delivery_notes:pdf:reprint"],
    } as never;

    const result = await service.printPdf(printer, 20, {
      copy: "REIMPRESION",
      reason: "Copia perdida",
    } as never);

    expect(result.filename).toContain("reimpresion");
    expect(repository.logPrint).toHaveBeenCalledWith(
      expect.objectContaining({ reprintSeq: 2, reason: "Copia perdida" }),
    );
  });
});

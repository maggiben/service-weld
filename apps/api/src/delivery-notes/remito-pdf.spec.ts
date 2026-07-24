import { buildRemitoPdf } from "./remito-pdf";

describe("buildRemitoPdf", () => {
  it("renders a PDF buffer with remito number and ORIGINAL banner", async () => {
    const result = await buildRemitoPdf({
      remitoNumber: "A-00000042",
      remitoType: "DELIVERY",
      status: "PREPARED",
      issuedDate: "2026-07-24",
      scheduledAt: null,
      observations: "Entregar en recepción",
      driverName: "Juan Pérez",
      helperName: null,
      vehiclePlate: "AB123CD",
      warehouseName: "Depósito Chacabuco",
      client: {
        name: "Acme SA",
        cuit: "30-71234567-8",
        address: "Calle Falsa 123",
      },
      lines: [
        {
          id: 1,
          remito_id: 9,
          line_no: 1,
          item_kind: "CYLINDER",
          cylinder_id: 5,
          accessory_id: null,
          serial_number: "SW-100",
          gas_code: "O2",
          capacity_value: 10,
          capacity_unit: "M3",
          is_rental: true,
          ownership_basis: "OURS",
          qty: 1,
          picked_qty: 1,
          delivered_qty: null,
          returned_qty: null,
          condition: "FULL",
          notes: null,
          movement_event_id: null,
          accessory_rental_id: null,
          weight_kg: null,
        },
      ],
      copyKind: "ORIGINAL",
      reprintSeq: null,
      reprintReason: null,
      printedAt: new Date("2026-07-24T12:00:00.000Z"),
    });

    expect(result.copyBanner).toBe("ORIGINAL");
    expect(result.filename).toContain("A-00000042");
    expect(result.buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(result.buffer.length).toBeGreaterThan(500);
  });

  it("labels reprints with sequence", async () => {
    const result = await buildRemitoPdf({
      remitoNumber: "A-1",
      remitoType: "RENTAL_DELIVERY",
      status: "CLOSED",
      issuedDate: "2026-07-01",
      scheduledAt: null,
      observations: null,
      driverName: null,
      helperName: null,
      vehiclePlate: null,
      warehouseName: null,
      client: { name: null, cuit: null, address: null },
      lines: [],
      copyKind: "REIMPRESION",
      reprintSeq: 3,
      reprintReason: "Copia perdida",
      printedAt: new Date("2026-07-24T12:00:00.000Z"),
    });
    expect(result.copyBanner).toBe("REIMPRESIÓN #3");
    expect(result.filename).toContain("reimpresion");
  });
});

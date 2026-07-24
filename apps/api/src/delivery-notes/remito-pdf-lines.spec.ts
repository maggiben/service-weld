import { linesForRemitoPdf } from "./remito-pdf-lines";

describe("linesForRemitoPdf", () => {
  it("prefers remito_line when present", () => {
    const lines = linesForRemitoPdf({
      id: 2,
      lines: [
        {
          id: 9,
          remito_id: 2,
          line_no: 1,
          item_kind: "CYLINDER",
          cylinder_id: 1,
          serial_number: "FROM-LINE",
          is_rental: true,
          qty: 1,
          picked_qty: 1,
        } as never,
      ],
      movements: [
        {
          id: 1,
          cylinder_id: 99,
          cylinder_serial: "FROM-MOVE",
          holder_party_id: 1,
          movement_kind: "RENTAL",
          delivery_date: "2026-01-01",
          return_date: null,
          state: "OPEN",
        },
      ],
      accessory_rentals: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.serial_number).toBe("FROM-LINE");
  });

  it("falls back to linked movements for legacy remitos", () => {
    const lines = linesForRemitoPdf({
      id: 2,
      lines: [],
      movements: [
        {
          id: 59591,
          cylinder_id: 6216,
          cylinder_serial: "6969",
          gas_code: "O2",
          capacity_m3: 10,
          capacity_unit: "M3",
          condition: "FULL",
          holder_party_id: 1974,
          movement_kind: "RENTAL",
          delivery_date: "2026-01-01",
          return_date: null,
          state: "OPEN",
        },
      ],
      accessory_rentals: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.item_kind).toBe("CYLINDER");
    expect(lines[0]?.serial_number).toBe("6969");
    expect(lines[0]?.cylinder_id).toBe(6216);
    expect(lines[0]?.gas_code).toBe("O2");
    expect(lines[0]?.capacity_value).toBe(10);
    expect(lines[0]?.capacity_unit).toBe("M3");
    expect(lines[0]?.condition).toBe("FULL");
    expect(lines[0]?.is_rental).toBe(true);
  });
});

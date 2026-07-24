import { ensureRemitoCylinderLine } from "./ensure-remito-cylinder-line";

describe("ensureRemitoCylinderLine", () => {
  it("is idempotent when the movement is already linked", async () => {
    const db = {
      selectFrom: (table: string) => {
        if (table === "remito_line") {
          return {
            select: () => ({
              where: () => ({
                where: () => ({
                  where: () => ({
                    executeTakeFirst: async () => ({ id: 88 }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await expect(
      ensureRemitoCylinderLine(db as never, {
        remitoId: 1,
        cylinderId: 2,
        movementEventId: 9,
        movementKind: "RENTAL",
        gasCode: "O2",
        propertyBasis: "OURS",
      }),
    ).resolves.toBe(88);
  });

  it("snapshots the cylinder onto a new remito line", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    let remitoLineSelects = 0;

    const db = {
      selectFrom: (table: string) => {
        if (table === "remito_line") {
          remitoLineSelects += 1;
          if (remitoLineSelects === 1) {
            return {
              select: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      executeTakeFirst: async () => undefined,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              where: () => ({
                executeTakeFirst: async () => ({ max_line_no: 2 }),
              }),
            }),
          };
        }
        if (table === "cylinder") {
          return {
            select: () => ({
              where: () => ({
                where: () => ({
                  executeTakeFirst: async () => ({
                    serial_number: "T-100",
                    gas_code: "N2",
                    capacity_m3: "10.5",
                    capacity_unit: "M3",
                    owner_party_id: 4,
                    ownership_basis: "OURS",
                    condition: "FULL",
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      insertInto: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values);
          return {
            returning: () => ({
              executeTakeFirstOrThrow: async () => ({ id: 15 }),
            }),
          };
        },
      }),
    };

    await expect(
      ensureRemitoCylinderLine(db as never, {
        remitoId: 10,
        cylinderId: 3,
        movementEventId: 77,
        movementKind: "RENTAL",
        gasCode: "O2",
        propertyBasis: "OURS",
      }),
    ).resolves.toBe(15);

    expect(inserted[0]).toMatchObject({
      remito_id: 10,
      line_no: 3,
      item_kind: "CYLINDER",
      cylinder_id: 3,
      serial_number: "T-100",
      gas_code: "O2",
      capacity_value: 10.5,
      is_rental: true,
      ownership_basis: "OURS",
      qty: 1,
      picked_qty: 1,
      delivered_qty: 1,
      movement_event_id: 77,
    });
  });

  it("marks sale lines as non-rental", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    let remitoLineSelects = 0;

    const db = {
      selectFrom: (table: string) => {
        if (table === "remito_line") {
          remitoLineSelects += 1;
          if (remitoLineSelects === 1) {
            return {
              select: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      executeTakeFirst: async () => undefined,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              where: () => ({
                executeTakeFirst: async () => ({ max_line_no: 0 }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => ({
                  serial_number: "S-1",
                  gas_code: "O2",
                  capacity_m3: null,
                  capacity_unit: "M3",
                  owner_party_id: null,
                  ownership_basis: "OURS",
                  condition: "FULL",
                }),
              }),
            }),
          }),
        };
      },
      insertInto: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values);
          return {
            returning: () => ({
              executeTakeFirstOrThrow: async () => ({ id: 1 }),
            }),
          };
        },
      }),
    };

    await ensureRemitoCylinderLine(db as never, {
      remitoId: 1,
      cylinderId: 2,
      movementEventId: 3,
      movementKind: "SALE",
      gasCode: null,
      propertyBasis: "OURS",
    });

    expect(inserted[0]?.is_rental).toBe(false);
  });
});

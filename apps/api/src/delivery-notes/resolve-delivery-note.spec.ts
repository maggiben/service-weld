import {
  allocateClosedDeliveryNote,
  resolveDeliveryNote,
} from "./resolve-delivery-note";

describe("resolveDeliveryNote", () => {
  function mockDb(handlers: {
    find?: { id: number } | undefined;
    insertId?: number;
    insertError?: unknown;
    findAfterRace?: { id: number } | undefined;
  }) {
    let findCalls = 0;
    const whereChain = () => {
      const chain: {
        where: () => typeof chain;
        executeTakeFirst: () => Promise<{ id: number } | undefined>;
      } = {
        where: () => chain,
        executeTakeFirst: async () => {
          findCalls += 1;
          if (findCalls === 1) return handlers.find;
          return handlers.findAfterRace;
        },
      };
      return chain;
    };
    return {
      selectFrom: () => ({
        select: () => whereChain(),
      }),
      insertInto: () => ({
        values: () => ({
          returning: () => ({
            executeTakeFirstOrThrow: async () => {
              if (handlers.insertError) throw handlers.insertError;
              return { id: handlers.insertId };
            },
          }),
        }),
      }),
    };
  }

  it("returns null for blank remito numbers", async () => {
    const db = mockDb({});
    await expect(
      resolveDeliveryNote(db as never, { remito_number: "  " }),
    ).resolves.toBeNull();
  });

  it("returns existing id without inserting", async () => {
    const db = mockDb({ find: { id: 42 } });
    await expect(
      resolveDeliveryNote(db as never, { remito_number: "1475" }),
    ).resolves.toBe(42);
  });

  it("inserts when missing", async () => {
    const db = mockDb({ find: undefined, insertId: 7 });
    await expect(
      resolveDeliveryNote(db as never, {
        remito_number: " 1475 ",
        issued_date: "2018-05-04",
        client_party_id: 501,
        kind: "RETURN",
      }),
    ).resolves.toBe(7);
  });

  it("re-selects after unique race", async () => {
    const db = mockDb({
      find: undefined,
      insertError: { code: "23505" },
      findAfterRace: { id: 99 },
    });
    await expect(
      resolveDeliveryNote(db as never, { remito_number: "1475" }),
    ).resolves.toBe(99);
  });
});

describe("allocateClosedDeliveryNote", () => {
  it("allocates from series and inserts a closed remito", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = {
      selectFrom: (table: string) => {
        if (table === "remito_series") {
          return {
            select: () => ({
              where: () => ({
                where: () => ({
                  forUpdate: () => ({
                    executeTakeFirst: async () => ({
                      id: 3,
                      code: "A",
                      pad_width: 4,
                      next_number: 9,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => undefined,
              }),
            }),
          }),
        };
      },
      updateTable: () => ({
        set: () => ({
          where: () => ({
            execute: async () => undefined,
          }),
        }),
      }),
      insertInto: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.push(values);
          return {
            returning: () => ({
              executeTakeFirstOrThrow: async () => ({ id: 55 }),
            }),
          };
        },
      }),
    };

    await expect(
      allocateClosedDeliveryNote(db as never, {
        issued_date: "2026-07-24",
        client_party_id: 10,
      }),
    ).resolves.toBe(55);

    expect(inserted[0]).toMatchObject({
      remito_number: "A-0009",
      series_id: 3,
      status: "CLOSED",
      issued_date: "2026-07-24",
      client_party_id: 10,
    });
  });
});

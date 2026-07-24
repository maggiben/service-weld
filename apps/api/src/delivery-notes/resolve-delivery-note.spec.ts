import { resolveDeliveryNote } from "./resolve-delivery-note";

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

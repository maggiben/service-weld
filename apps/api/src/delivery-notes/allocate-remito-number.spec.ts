import { allocateRemitoNumber } from "./allocate-remito-number";

describe("allocateRemitoNumber", () => {
  it("locks series, formats number, and bumps next_number", async () => {
    const updates: Array<{ next_number: number }> = [];
    const db = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({
              forUpdate: () => ({
                executeTakeFirst: async () => ({
                  id: 1,
                  code: "A",
                  pad_width: 8,
                  next_number: 7,
                }),
              }),
            }),
          }),
        }),
      }),
      updateTable: () => ({
        set: (values: { next_number: number }) => {
          updates.push(values);
          return {
            where: () => ({
              execute: async () => undefined,
            }),
          };
        },
      }),
    };

    await expect(allocateRemitoNumber(db as never)).resolves.toEqual({
      seriesId: 1,
      remitoNumber: "A-00000007",
    });
    expect(updates).toEqual([{ next_number: 8 }]);
  });

  it("throws when series is missing", async () => {
    const db = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({
              forUpdate: () => ({
                executeTakeFirst: async () => undefined,
              }),
            }),
          }),
        }),
      }),
    };

    await expect(allocateRemitoNumber(db as never)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

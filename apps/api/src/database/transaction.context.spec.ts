import {
  runInTransaction,
  getTransaction,
  resolveDb,
} from "./transaction.context";

describe("transaction.context", () => {
  it("pins and clears the active transaction", async () => {
    const db = { kind: "db" } as never;
    const tx = { kind: "tx" } as never;

    expect(getTransaction()).toBeUndefined();
    expect(resolveDb(db)).toBe(db);

    await runInTransaction(tx, async () => {
      expect(getTransaction()).toBe(tx);
      expect(resolveDb(db)).toBe(tx);
    });

    expect(getTransaction()).toBeUndefined();
  });
});

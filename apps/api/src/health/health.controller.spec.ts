import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns ok payload with db status", async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    // Kysely `sql\`select 1\`.execute(db)` ultimately hits db.executeQuery.
    const db = { executeQuery: execute };
    const controller = new HealthController(db as never);
    const result = await controller.check();
    expect(result.status).toBe("ok");
    expect(typeof result.db).toBe("string");
    expect(result.time).toEqual(expect.any(String));
  });

  it("marks db down when query fails", async () => {
    const db = {
      executeQuery: jest.fn().mockRejectedValue(new Error("boom")),
    };
    const controller = new HealthController(db as never);
    const result = await controller.check();
    expect(result.status).toBe("ok");
    expect(result.db).toBe("down");
  });
});

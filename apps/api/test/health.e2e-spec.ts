import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";

/**
 * Phase 0 smoke e2e: the app boots and /api/v1/health responds.
 * Requires a reachable DATABASE_URL (CI provides an ephemeral Postgres).
 * Expands into per-workflow e2e tests in later phases (010 R4).
 */
describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("/api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /api/v1/health returns ok + db status", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(["up", "down"]).toContain(res.body.db);
  });
});

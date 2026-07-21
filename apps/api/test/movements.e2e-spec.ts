import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ZodValidationPipe } from "nestjs-zod";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

/**
 * Delivery / return workflow e2e (010 R4 — W1 core).
 * Uses the configured DATABASE_URL (dev DB or CI ephemeral Postgres).
 *
 * Date ranges must not overlap prior non-VOID movements on the same cylinder
 * (ex_move_no_overlap). Same-day return→redeliver is allowed ([d,d) empty).
 */
describe("Movements delivery (e2e)", () => {
  let app: INestApplication;
  let token: string;
  let holderPartyId: number;

  /** Fixed window unlikely to collide with migrated history (all ≤ 2024). */
  const DAY0 = "2026-06-01";
  const DAY7 = "2026-06-08";

  async function authGet(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set("Authorization", `Bearer ${token}`);
  }

  async function authPost(path: string, body: unknown) {
    return request(app.getHttpServer())
      .post(path)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send(body);
  }

  async function authPatch(path: string, body: unknown) {
    return request(app.getHttpServer())
      .patch(path)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  async function pickStockOursCylinder(): Promise<number> {
    const res = await authGet(
      "/api/v1/cylinders?limit=30&filter%5Bstate%5D=IN_STOCK_EMPTY&filter%5Bownership_basis%5D=OURS",
    );
    expect(res.status).toBe(200);
    const found = (
      res.body.data as Array<{ id: number; packaging: string }>
    ).find((c) => c.packaging === "SINGLE");
    expect(found).toBeDefined();
    return found!.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("/api/v1");
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    const username = process.env.BOOTSTRAP_ADMIN_USER ?? "admin";
    const password =
      process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "change-me-on-first-login";

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ username, password });
    expect([200, 201]).toContain(login.status);
    token = login.body.access_token as string;

    const clients = await authGet("/api/v1/clients?limit=1");
    expect(clients.status).toBe(200);
    expect(clients.body.data.length).toBeGreaterThan(0);
    holderPartyId = clients.body.data[0].id as number;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("opens a RENTAL delivery, rejects a second open (BR-01), then returns (BR-03)", async () => {
    const cylinderId = await pickStockOursCylinder();

    const open = await authPost("/api/v1/movements", {
      cylinder_id: cylinderId,
      holder_party_id: holderPartyId,
      movement_kind: "RENTAL",
      gas_code: "O2",
      delivery_date: DAY0,
      note: "e2e deliver",
    });
    expect(open.status).toBe(201);
    expect(open.body.state).toBe("OPEN");
    expect(open.body.cylinder_id).toBe(cylinderId);
    expect(open.body.movement_kind).toBe("RENTAL");
    const movementId = open.body.id as number;

    const cylOut = await authGet(`/api/v1/cylinders/${cylinderId}`);
    expect(cylOut.status).toBe(200);
    expect(cylOut.body.state).toBe("AT_CLIENT");

    const duplicate = await authPost("/api/v1/movements", {
      cylinder_id: cylinderId,
      holder_party_id: holderPartyId,
      movement_kind: "RENTAL",
      delivery_date: DAY0,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("CYLINDER_ALREADY_OUT");

    const closed = await authPatch(`/api/v1/movements/${movementId}/return`, {
      return_date: DAY7,
    });
    expect(closed.status).toBe(200);
    expect(closed.body.state).toBe("CLOSED");
    expect(closed.body.rental_days).toBe(7);

    const cylBack = await authGet(`/api/v1/cylinders/${cylinderId}`);
    expect(cylBack.status).toBe(200);
    expect(cylBack.body.state).toBe("IN_STOCK_EMPTY");
  });

  it("rejects REFILL on an OURS cylinder with 422 KIND_BASIS_MISMATCH (BR-08)", async () => {
    const cylinderId = await pickStockOursCylinder();

    const res = await authPost("/api/v1/movements", {
      cylinder_id: cylinderId,
      holder_party_id: holderPartyId,
      movement_kind: "REFILL",
      delivery_date: DAY0,
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("KIND_BASIS_MISMATCH");
  });

  it("rejects return_date before delivery_date with 422 RETURN_BEFORE_DELIVERY (BR-04)", async () => {
    const cylinderId = await pickStockOursCylinder();
    // Use a later free day so it does not overlap the BR-03 interval on the
    // same first stock cylinder if the picker returns it again.
    const delivery = "2026-06-15";

    const open = await authPost("/api/v1/movements", {
      cylinder_id: cylinderId,
      holder_party_id: holderPartyId,
      movement_kind: "RENTAL",
      delivery_date: delivery,
    });
    expect(open.status).toBe(201);
    const movementId = open.body.id as number;

    const bad = await authPatch(`/api/v1/movements/${movementId}/return`, {
      return_date: "2026-06-01",
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("RETURN_BEFORE_DELIVERY");

    // Same-day return keeps the half-open range empty → redeliver allowed later.
    const closed = await authPatch(`/api/v1/movements/${movementId}/return`, {
      return_date: delivery,
    });
    expect(closed.status).toBe(200);
    expect(closed.body.rental_days).toBe(0);
  });
});

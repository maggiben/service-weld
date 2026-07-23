import * as password from "./password";
import { AuthService } from "./auth.service";
import { principal } from "../test-utils/fixtures";

jest.mock("./password", () => {
  const actual = jest.requireActual("./password");
  return {
    ...actual,
    verifyPassword: jest.fn(),
    generateRefreshToken: jest.fn(() => "refresh-token-value"),
    hashRefreshToken: jest.fn((t: string) => `hash:${t}`),
  };
});

type RowMap = Record<string, unknown>;

function createDbMock(handlers: {
  takeFirst?: (table: string) => RowMap | null | undefined;
  many?: (table: string) => RowMap[];
  execute?: (table: string, op: string) => void;
}) {
  const chain = (table: string, op = "select") => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    for (const m of [
      "selectFrom",
      "select",
      "where",
      "innerJoin",
      "insertInto",
      "values",
      "updateTable",
      "set",
    ]) {
      api[m] = jest.fn((...args: unknown[]) => {
        if (m === "selectFrom" || m === "insertInto" || m === "updateTable") {
          return chain(String(args[0]), m === "selectFrom" ? "select" : m);
        }
        return self();
      });
    }
    api.executeTakeFirst = jest.fn(async () =>
      handlers.takeFirst ? handlers.takeFirst(table) : null,
    );
    api.execute = jest.fn(async () => {
      handlers.execute?.(table, op);
      return handlers.many ? handlers.many(table) : [];
    });
    return api;
  };

  return {
    selectFrom: (table: string) => chain(table, "select"),
    insertInto: (table: string) => chain(table, "insert"),
    updateTable: (table: string) => chain(table, "update"),
  };
}

describe("AuthService", () => {
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue("access.jwt"),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === "JWT_ACCESS_TTL") return 3600;
      if (key === "JWT_REFRESH_TTL") return 86400;
      if (key === "JWT_ACCESS_SECRET") return "secret";
      return undefined;
    }),
  };

  const verifyPassword = password.verifyPassword as jest.Mock;
  const userRow = {
    id: 1,
    username: "admin",
    password_hash: "hash",
    is_active: true,
    mfa_enabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    verifyPassword.mockResolvedValue(true);
  });

  it("validateUser returns principal or null", async () => {
    let db = createDbMock({ takeFirst: () => null });
    let service = new AuthService(
      db as never,
      jwtService as never,
      config as never,
    );
    expect(await service.validateUser("x", "y")).toBeNull();

    db = createDbMock({
      takeFirst: (table) => (table === "app_user" ? userRow : null),
      many: (table) => {
        if (table === "user_role") return [{ code: "ADMIN" }];
        if (table === "user_territory_scope") return [{ id: 1, name: "Junín" }];
        return [];
      },
    });
    service = new AuthService(
      db as never,
      jwtService as never,
      config as never,
    );
    const p = await service.validateUser("admin", "ok");
    expect(p).toMatchObject({
      id: 1,
      username: "admin",
      roles: ["ADMIN"],
    });

    verifyPassword.mockResolvedValue(false);
    expect(await service.validateUser("admin", "bad")).toBeNull();

    db = createDbMock({
      takeFirst: () => ({ ...userRow, is_active: false }),
    });
    service = new AuthService(
      db as never,
      jwtService as never,
      config as never,
    );
    expect(await service.validateUser("admin", "ok")).toBeNull();
  });

  it("validateRefreshToken checks expiry and revocation", async () => {
    let db = createDbMock({ takeFirst: () => null });
    let service = new AuthService(
      db as never,
      jwtService as never,
      config as never,
    );
    expect(await service.validateRefreshToken("t")).toBeNull();

    db = createDbMock({
      takeFirst: (table) => {
        if (table === "refresh_token") {
          return {
            user_id: 1,
            expires_at: new Date(Date.now() - 1000),
            revoked_at: null,
          };
        }
        return null;
      },
    });
    service = new AuthService(
      db as never,
      jwtService as never,
      config as never,
    );
    expect(await service.validateRefreshToken("t")).toBeNull();

    db = createDbMock({
      takeFirst: (table) => {
        if (table === "refresh_token") {
          return {
            user_id: 1,
            expires_at: new Date(Date.now() + 60_000),
            revoked_at: null,
          };
        }
        if (table === "app_user") return userRow;
        return null;
      },
      many: (table) => (table === "user_role" ? [{ code: "CLERK" }] : []),
    });
    service = new AuthService(
      db as never,
      jwtService as never,
      config as never,
    );
    await expect(service.validateRefreshToken("t")).resolves.toMatchObject({
      id: 1,
      roles: ["CLERK"],
    });
  });

  it("login, refresh, logout, and me", async () => {
    const db = createDbMock({});
    const service = new AuthService(
      db as never,
      jwtService as never,
      config as never,
    );
    const p = principal({
      roles: ["ADMIN"],
      territories: [{ id: 1, name: "Junín" }],
      capabilities: ["admin:write"],
    });

    const tokens = await service.login(p, { userAgent: "ua", ip: "1.1.1.1" });
    expect(tokens.access_token).toBe("access.jwt");
    expect(tokens.refresh_token).toBe("refresh-token-value");
    expect(tokens.territories).toEqual(["Junín"]);

    const refreshed = await service.refresh(p, "old-refresh");
    expect(refreshed.access_token).toBe("access.jwt");

    await service.logout("old-refresh");

    expect(service.me(p)).toMatchObject({
      id: p.id,
      username: p.username,
      capabilities: ["admin:write"],
      territories: ["Junín"],
    });
  });
});

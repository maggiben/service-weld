import type { Mock } from "vitest";
import * as password from "./password";
import { AuthService } from "./auth.service";
import { principal } from "../test-utils/fixtures";

vi.mock("./password", async () => {
  const actual = await vi.importActual("./password");
  return {
    ...actual,
    verifyPassword: vi.fn(),
    generateRefreshToken: vi.fn(() => "refresh-token-value"),
    hashRefreshToken: vi.fn((translate: string) => `hash:${translate}`),
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
    for (const member of [
      "selectFrom",
      "select",
      "where",
      "innerJoin",
      "insertInto",
      "values",
      "updateTable",
      "set",
    ]) {
      api[member] = vi.fn((...args: unknown[]) => {
        if (
          member === "selectFrom" ||
          member === "insertInto" ||
          member === "updateTable"
        ) {
          return chain(
            String(args[0]),
            member === "selectFrom" ? "select" : member,
          );
        }
        return self();
      });
    }
    api.executeTakeFirst = vi.fn(async () =>
      handlers.takeFirst ? handlers.takeFirst(table) : null,
    );
    api.execute = vi.fn(async () => {
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
    signAsync: vi.fn().mockResolvedValue("access.jwt"),
  };
  const config = {
    get: vi.fn((key: string) => {
      if (key === "JWT_ACCESS_TTL") return 3600;
      if (key === "JWT_REFRESH_TTL") return 86400;
      if (key === "JWT_ACCESS_SECRET") return "secret";
      return undefined;
    }),
  };

  const verifyPassword = password.verifyPassword as Mock;
  const userRow = {
    id: 1,
    username: "admin",
    password_hash: "hash",
    is_active: true,
    mfa_enabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
    const part = await service.validateUser("admin", "ok");
    expect(part).toMatchObject({
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
    const db = createDbMock({
      takeFirst: (table) => (table === "app_user" ? userRow : null),
      many: (table) => {
        if (table === "user_role") return [{ code: "ADMIN" }];
        if (table === "user_territory_scope") return [{ id: 1, name: "Junín" }];
        return [];
      },
    });
    const service = new AuthService(
      db as never,
      jwtService as never,
      config as never,
    );
    const part = principal({
      id: 1,
      username: "admin",
      roles: ["ADMIN"],
      territories: [{ id: 1, name: "Junín" }],
      capabilities: ["admin:write"],
    });

    const tokens = await service.login(part, {
      userAgent: "ua",
      ip: "1.1.1.1",
    });
    expect(tokens.access_token).toBe("access.jwt");
    expect(tokens.refresh_token).toBe("refresh-token-value");
    expect(tokens.territories).toEqual(["Junín"]);

    const refreshed = await service.refresh(part, "old-refresh");
    expect(refreshed.access_token).toBe("access.jwt");

    await service.logout("old-refresh");

    const me = await service.me(part);
    expect(me).toMatchObject({
      id: part.id,
      username: part.username,
      roles: ["ADMIN"],
      territories: ["Junín"],
    });
    expect(me.capabilities).toContain("delivery_notes:read");
    expect(me.capabilities).toContain("admin:write");
  });
});

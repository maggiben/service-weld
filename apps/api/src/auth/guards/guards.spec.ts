import { Reflector } from "@nestjs/core";
import { ApiError } from "../../common/errors/api-error";
import { principal } from "../../test-utils/fixtures";
import { CapabilitiesGuard } from "./capabilities.guard";
import {
  readTerritoryScope,
  TerritoryScopeGuard,
  TERRITORY_SCOPE_KEY,
} from "./territory-scope.guard";

function httpContext(user?: ReturnType<typeof principal>, caps?: string[]) {
  const request: Record<string, unknown> = { user };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    request,
    caps,
  };
}

describe("CapabilitiesGuard", () => {
  it("allows when no caps required", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    const guard = new CapabilitiesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(httpContext() as never)).toBe(true);
  });

  it("requires auth and matching capabilities", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["clients:write"]),
    };
    const guard = new CapabilitiesGuard(reflector as unknown as Reflector);

    expect(() => guard.canActivate(httpContext() as never)).toThrow(ApiError);

    expect(() =>
      guard.canActivate(
        httpContext(
          principal({ roles: ["MEDICAL"], capabilities: ["clients:read"] }),
        ) as never,
      ),
    ).toThrow(ApiError);

    expect(
      guard.canActivate(
        httpContext(
          principal({
            roles: ["CLERK"],
            capabilities: [], // stale JWT snapshot must not block
          }),
        ) as never,
      ),
    ).toBe(true);
  });
});

describe("TerritoryScopeGuard", () => {
  const guard = new TerritoryScopeGuard();

  it("passes through without user", () => {
    expect(guard.canActivate(httpContext() as never)).toBe(true);
  });

  it("clears scope for global and unscoped roles", () => {
    const adminCtx = httpContext(
      principal({ roles: ["ADMIN"], territories: [] }),
    );
    expect(guard.canActivate(adminCtx as never)).toBe(true);
    expect(adminCtx.request[TERRITORY_SCOPE_KEY]).toBeNull();

    const plantCtx = httpContext(
      principal({ roles: ["PLANT"], territories: [] }),
    );
    expect(guard.canActivate(plantCtx as never)).toBe(true);
    expect(plantCtx.request[TERRITORY_SCOPE_KEY]).toBeNull();
  });

  it("treats empty territory assignment as all territories for scoped roles", () => {
    const emptyCtx = httpContext(
      principal({ roles: ["CLERK"], territories: [] }),
    );
    expect(guard.canActivate(emptyCtx as never)).toBe(true);
    expect(emptyCtx.request[TERRITORY_SCOPE_KEY]).toBeNull();

    const ctx = httpContext(
      principal({
        roles: ["CLERK"],
        territories: [
          { id: 1, name: "A" },
          { id: 2, name: "B" },
        ],
      }),
    );
    expect(guard.canActivate(ctx as never)).toBe(true);
    expect(ctx.request[TERRITORY_SCOPE_KEY]).toEqual([1, 2]);
    expect(readTerritoryScope(ctx.request)).toEqual([1, 2]);
    expect(readTerritoryScope({})).toBeNull();
  });
});

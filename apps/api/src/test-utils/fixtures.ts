import type { AuthPrincipal } from "../auth/principal";

export function principal(
  overrides: Partial<AuthPrincipal> = {},
): AuthPrincipal {
  return {
    id: 1,
    username: "clerk",
    roles: ["CLERK"],
    capabilities: ["clients:read", "clients:write", "movements:write"],
    territories: [{ id: 10, name: "Junín" }],
    mfa: false,
    ...overrides,
  };
}

import {
  ROLE_CAPABILITIES,
  capabilitiesForRoles,
  hasCapabilities,
} from "./capabilities";
import {
  isTerritoryScoped,
  hasGlobalTerritoryAccess,
  territoryIdsForPrincipal,
  isMedicalRole,
  canViewMunicipalHospitalClients,
  type AuthPrincipal,
} from "./principal";

describe("capabilities", () => {
  it("unions role capabilities", () => {
    const caps = capabilitiesForRoles(["DRIVER", "CLERK"]);
    expect(caps).toContain("movements:write");
    expect(caps).toContain("delivery_notes:read");
    expect(caps).toContain("delivery_notes:write");
    expect(caps).toEqual([...caps].sort());
    expect(ROLE_CAPABILITIES.ADMIN.length).toBeGreaterThan(10);
    expect(ROLE_CAPABILITIES.BILLING).toContain("delivery_notes:write");
    expect(hasCapabilities(caps, ["clients:read"])).toBe(true);
    expect(hasCapabilities(caps, ["admin:write"])).toBe(false);
  });

  it("limits dashboard/billing write to ADMIN, BILLING, MANAGER, SUBDIST", () => {
    const billingRoles = ["ADMIN", "BILLING", "MANAGER", "SUBDIST"] as const;
    for (const role of billingRoles) {
      expect(ROLE_CAPABILITIES[role]).toContain("billing:read");
      expect(ROLE_CAPABILITIES[role]).toContain("billing:write");
      expect(ROLE_CAPABILITIES[role]).toContain("billing:approve");
    }
    for (const role of [
      "CLERK",
      "DRIVER",
      "PLANT",
      "INVENTORY",
      "MEDICAL",
      "CLIENT",
    ] as const) {
      expect(ROLE_CAPABILITIES[role]).not.toContain("billing:read");
      expect(ROLE_CAPABILITIES[role]).not.toContain("billing:write");
      expect(ROLE_CAPABILITIES[role]).not.toContain("billing:approve");
    }
  });
});

describe("principal territory helpers", () => {
  const base: AuthPrincipal = {
    id: 1,
    username: "u",
    roles: ["CLERK"],
    capabilities: [],
    territories: [
      { id: 1, name: "Junín" },
      { id: 2, name: "Ceres" },
    ],
    mfa: false,
  };

  it("detects scoped vs global", () => {
    expect(isTerritoryScoped(["CLERK"])).toBe(true);
    expect(isTerritoryScoped(["ADMIN"])).toBe(false);
    expect(hasGlobalTerritoryAccess(["ADMIN"])).toBe(true);
    expect(hasGlobalTerritoryAccess(["DRIVER"])).toBe(false);
    expect(isMedicalRole(["MEDICAL"])).toBe(true);
    expect(isMedicalRole(["ADMIN"])).toBe(true);
    expect(isMedicalRole(["CLERK"])).toBe(false);
    expect(canViewMunicipalHospitalClients(["BILLING"])).toBe(true);
    expect(canViewMunicipalHospitalClients(["MEDICAL"])).toBe(true);
    expect(canViewMunicipalHospitalClients(["CLERK"])).toBe(false);
    expect(canViewMunicipalHospitalClients(["MANAGER"])).toBe(false);
  });

  it("territoryIdsForPrincipal", () => {
    expect(territoryIdsForPrincipal(base)).toEqual([1, 2]);
    expect(territoryIdsForPrincipal({ ...base, roles: ["ADMIN"] })).toBeNull();
    expect(territoryIdsForPrincipal({ ...base, roles: ["PLANT"] })).toBeNull();
    expect(
      territoryIdsForPrincipal({ ...base, roles: ["CLERK"], territories: [] }),
    ).toBeNull();
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidCuit, Cuit } from "./cuit";
import {
  CreateLocalityInput,
  CreateTerritoryInput,
  Locality,
  LocalityListQuery,
  LocalityListResponse,
  Territory,
  TerritoryListQuery,
  TerritoryListResponse,
  normalizeTerritoryName,
  territoryMatchKey,
} from "./geo";
import {
  SystemSettings,
  UpdateSystemSettingsInput,
  BusinessTimezone,
} from "./settings";

/** Known-valid CUITs covering check-digit branches (mod 11→0, mod 10→9, normal). */
const VALID = ["20-12345678-6", "00-00000000-0", "00-00000001-9"] as const;

describe("cuit", () => {
  it("accepts valid check digits", () => {
    for (const value of VALID) {
      assert.equal(isValidCuit(value), true, value);
      assert.equal(Cuit.parse(value), value);
    }
  });

  it("rejects bad format and bad check digits", () => {
    assert.equal(isValidCuit("bad"), false);
    assert.equal(isValidCuit("20-1234567-6"), false);
    assert.equal(isValidCuit("20-12345678-0"), false);
    assert.equal(isValidCuit("00-00000000-1"), false);
    assert.throws(() => Cuit.parse("11-11111111-1"));
    assert.throws(() => Cuit.parse("not-a-cuit"));
  });
});

describe("settings", () => {
  it("accepts full system settings", () => {
    const parsed = SystemSettings.parse({
      supplier_loan_overdue_days: 120,
      business_timezone: "America/Argentina/Buenos_Aires",
      rental_min_days: 0,
      primary_language: "es",
      version: 1,
    });
    assert.equal(parsed.primary_language, "es");
    assert.equal(parsed.rental_min_days, 0);
  });

  it("allows partial updates", () => {
    assert.equal(
      UpdateSystemSettingsInput.parse({ rental_min_days: 1 }).rental_min_days,
      1,
    );
    assert.throws(() => UpdateSystemSettingsInput.parse({}));
    assert.throws(() => BusinessTimezone.parse("Not/A_Zone"));
  });
});

describe("territory name normalization", () => {
  it("trims, collapses spaces, and title-cases", () => {
    assert.equal(normalizeTerritoryName(""), "");
    assert.equal(normalizeTerritoryName("   "), "");
    assert.equal(normalizeTerritoryName("  pergamino  "), "Pergamino");
    assert.equal(normalizeTerritoryName("LA   PLATA"), "La Plata");
    assert.equal(normalizeTerritoryName("junín"), "Junín");
  });

  it("matches ignoring case and diacritics", () => {
    assert.equal(territoryMatchKey("Junín"), territoryMatchKey("junin"));
    assert.equal(
      territoryMatchKey("Chacabuco"),
      territoryMatchKey("  chacabuco "),
    );
    assert.notEqual(territoryMatchKey("Junín"), territoryMatchKey("Chacabuco"));
  });

  it("normalizes CreateTerritoryInput.name", () => {
    assert.equal(
      CreateTerritoryInput.parse({ name: "  san  pedro " }).name,
      "San Pedro",
    );
    assert.throws(() => CreateTerritoryInput.parse({ name: "   " }));
    assert.throws(() => CreateTerritoryInput.parse({ name: "x".repeat(121) }));
  });
});

describe("geo schemas", () => {
  it("parses territory list payloads", () => {
    const territory = Territory.parse({
      id: 1,
      name: "Junín",
      is_active: true,
    });
    assert.equal(territory.name, "Junín");

    const query = TerritoryListQuery.parse({
      limit: 50,
      q: "jun",
      "filter[is_active]": "true",
    });
    assert.equal(query.q, "jun");
    assert.equal(query["filter[is_active]"], "true");

    const list = TerritoryListResponse.parse({
      data: [territory],
      page: {
        limit: 50,
        has_more: false,
        next_cursor: null,
        total_estimate: null,
      },
    });
    assert.equal(list.data.length, 1);
  });

  it("parses locality create and list payloads", () => {
    const locality = Locality.parse({
      id: 10,
      name: "Pergamino",
      province: "Buenos Aires",
      territory_id: 1,
      territory_name: "Junín",
      client_count: 3,
      cylinder_count: 12,
    });
    assert.equal(locality.territory_id, 1);

    const created = CreateLocalityInput.parse({ name: "  Rojas " });
    assert.equal(created.name, "Rojas");
    assert.equal(created.province, "Buenos Aires");
    assert.equal(
      CreateLocalityInput.parse({
        name: "Salto",
        province: "Buenos Aires",
        territory_id: null,
      }).territory_id,
      null,
    );

    const query = LocalityListQuery.parse({
      limit: 25,
      q: "per",
      "filter[territory_id]": "2",
      "filter[has_clients]": "true",
    });
    assert.equal(query["filter[territory_id]"], 2);

    const list = LocalityListResponse.parse({
      data: [locality],
      page: {
        limit: 25,
        has_more: false,
        next_cursor: null,
        total_estimate: 1,
      },
    });
    assert.equal(list.data[0]?.name, "Pergamino");
  });
});

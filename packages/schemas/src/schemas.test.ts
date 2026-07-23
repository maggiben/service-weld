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
  LongOutstandingDays,
} from "./settings";
import {
  MigrationDataStatus,
  MigrationExportDataset,
  MigrationMarkGoodRequest,
  MIGRATION_PURGE_CONFIRMATION,
  MigrationPurgeBusinessRequest,
  MigrationRollbackRequest,
  MigrationRunRequest,
  MigrationRunResult,
  MigrationSnapshot,
  MigrationUploadedFile,
  MigrationWorkbookSlot,
} from "./migration-data";

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
      long_outstanding_days: 90,
      business_timezone: "America/Argentina/Buenos_Aires",
      rental_min_days: 0,
      primary_language: "es",
      version: 1,
    });
    assert.equal(parsed.primary_language, "es");
    assert.equal(parsed.rental_min_days, 0);
    assert.equal(parsed.long_outstanding_days, 90);
    assert.equal(LongOutstandingDays.parse(5000), 5000);
    assert.throws(() => LongOutstandingDays.parse(36501));
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

describe("migration-data schemas", () => {
  it("parses run request defaults and status shape", () => {
    assert.equal(MigrationRunRequest.parse({}).dry_run, true);
    assert.equal(MigrationWorkbookSlot.parse("junin"), "junin");
    const status = MigrationDataStatus.parse({
      uploads: [],
      ready_to_run: false,
      missing_slots: ["junin", "chacabuco", "propios"],
      snapshots: [],
      last_report: null,
      last_report_at: null,
      busy: false,
      live_job: null,
      workbook_guide: [
        {
          slot: "junin",
          title: "Junín",
          filename_hint: "CILINDRO CLIENT REPARTO.xls",
          description: "Client ledgers Junín",
          required: true,
        },
      ],
    });
    assert.equal(status.missing_slots.length, 3);
    assert.equal(status.live_job, null);
  });

  it("parses upload, snapshot, run, rollback, and mark-good payloads", () => {
    assert.equal(MigrationExportDataset.parse("clients"), "clients");
    assert.equal(MigrationExportDataset.parse("all"), "all");

    const uploaded = MigrationUploadedFile.parse({
      slot: "propios",
      original_name: "CILINDROS PROPIOS.xls",
      size_bytes: 1024,
      uploaded_at: "2026-07-22T12:00:00.000Z",
    });
    assert.equal(uploaded.slot, "propios");

    const snap = MigrationSnapshot.parse({
      id: "20260722T120000Z_abcd1234",
      label: "pre-sync",
      created_at: "2026-07-22T12:00:00.000Z",
      row_counts: { clients: 1, cylinders: 2 },
      dump_bytes: 10,
      elapsed_s: 1.2,
      marked_good: true,
    });
    assert.equal(snap.marked_good, true);

    const run = MigrationRunResult.parse({
      dry_run: false,
      snapshot_id: snap.id,
      report: { imported_clean: 3 },
    });
    assert.equal(run.dry_run, false);

    assert.equal(
      MigrationRollbackRequest.parse({ snapshot_id: snap.id }).snapshot_id,
      snap.id,
    );
    assert.equal(
      MigrationMarkGoodRequest.parse({ snapshot_id: snap.id }).good,
      true,
    );
    assert.equal(
      MigrationMarkGoodRequest.parse({
        snapshot_id: snap.id,
        good: false,
      }).good,
      false,
    );
    assert.throws(() => MigrationWorkbookSlot.parse("other"));
    assert.throws(() => MigrationRunRequest.parse({ label: "x".repeat(200) }));
  });

  it("requires exact purge confirmation phrase", () => {
    assert.equal(
      MigrationPurgeBusinessRequest.parse({
        confirmation: MIGRATION_PURGE_CONFIRMATION,
      }).confirmation,
      "VACIAR DATOS",
    );
    assert.throws(() =>
      MigrationPurgeBusinessRequest.parse({ confirmation: "vaciar datos" }),
    );
    assert.throws(() =>
      MigrationPurgeBusinessRequest.parse({ confirmation: "DELETE" }),
    );
  });
});

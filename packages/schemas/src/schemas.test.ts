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
import {
  CreateMovementInput,
  MovementEvent,
  MovementListQuery,
  MovementListResponse,
  ReturnMovementInput,
  SwapMovementInput,
  VoidMovementInput,
} from "./movement";
import {
  CreateDeliveryNoteInput,
  DeliveryNote,
  DeliveryNoteDetail,
  DeliveryNoteListQuery,
} from "./delivery-note";

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

describe("movement schemas", () => {
  const event = {
    id: 1,
    request_id: "11111111-1111-4111-8111-111111111111",
    cylinder_id: 10,
    holder_party_id: 20,
    holder_name: "Acme",
    movement_kind: "RENTAL",
    property_basis: "OURS",
    gas_code: "O2",
    delivery_date: "2026-07-01",
    return_date: null,
    rental_days: null,
    origin_party_id: null,
    swap_with_cyl_id: null,
    remito_id: null,
    state: "OPEN",
    note: null,
    version: 1,
    created_at: "2026-07-01T12:00:00.000Z",
    cylinder_serial: "323214",
  };

  it("parses movement event and write inputs", () => {
    assert.equal(MovementEvent.parse(event).cylinder_serial, "323214");
    assert.equal(
      CreateMovementInput.parse({
        cylinder_id: 10,
        holder_party_id: 20,
        movement_kind: "RENTAL",
        delivery_date: "2026-07-01",
      }).movement_kind,
      "RENTAL",
    );
    assert.equal(
      ReturnMovementInput.parse({ return_date: "2026-07-10" }).return_date,
      "2026-07-10",
    );
    assert.equal(
      SwapMovementInput.parse({
        returned_cylinder_id: 11,
        return_date: "2026-07-10",
      }).returned_cylinder_id,
      11,
    );
    assert.equal(VoidMovementInput.parse({ reason: "dup" }).reason, "dup");
    assert.throws(() => VoidMovementInput.parse({ reason: "" }));
  });

  it("accepts serial or holder search on MovementListQuery", () => {
    const query = MovementListQuery.parse({
      limit: 50,
      q: "3232",
      open: "true",
      "filter[state]": "OPEN",
      "filter[movement_kind]": "RENTAL",
      "filter[gas_code]": "O2",
    });
    assert.equal(query.q, "3232");
    assert.equal(query.open, true);
    assert.equal(query["filter[state]"], "OPEN");
  });

  it("parses MovementListResponse", () => {
    const list = MovementListResponse.parse({
      data: [event],
      page: {
        limit: 50,
        has_more: false,
        next_cursor: null,
        total_estimate: 1,
      },
    });
    assert.equal(list.data[0]?.id, 1);
  });
});

describe("delivery-note schemas", () => {
  it("parses DeliveryNote and create/list contracts", () => {
    assert.equal(
      DeliveryNote.parse({
        id: 1,
        remito_number: "1475",
        kind: "DELIVERY",
        issued_date: "2018-05-04",
        client_party_id: 501,
        client_name: "Acme",
      }).remito_number,
      "1475",
    );
    assert.equal(
      CreateDeliveryNoteInput.parse({ remito_number: " 1475 " }).kind,
      "DELIVERY",
    );
    assert.equal(
      CreateDeliveryNoteInput.parse({
        remito_number: "90",
        kind: "RETURN",
      }).kind,
      "RETURN",
    );
    assert.throws(() => CreateDeliveryNoteInput.parse({ remito_number: "" }));
    const query = DeliveryNoteListQuery.parse({
      q: "1475",
      "filter[client_party_id]": "501",
      "filter[kind]": "RETURN",
    });
    assert.equal(query.sort, "-issued_date");
    assert.equal(query["filter[client_party_id]"], 501);
    assert.equal(query["filter[kind]"], "RETURN");
    assert.equal(
      DeliveryNoteDetail.parse({
        id: 1,
        remito_number: "1475",
        kind: "DELIVERY",
        issued_date: "2018-05-04",
        client_party_id: 501,
        movement_count: 1,
        accessory_rental_count: 0,
        movements: [
          {
            id: 9,
            cylinder_id: 10,
            cylinder_serial: "323214",
            holder_party_id: 501,
            holder_name: "Acme",
            movement_kind: "RENTAL",
            delivery_date: "2018-05-04",
            return_date: null,
            state: "OPEN",
          },
        ],
        accessory_rentals: [],
      }).movements[0]?.cylinder_serial,
      "323214",
    );
  });
});

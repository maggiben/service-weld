import assert from "node:assert/strict";
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
  CreateBillingRunInput,
  BillingExportPayload,
  BillingRun,
  BillingRunDetail,
  ChargeLine,
  Invoice,
  InvoiceArcaAuthorization,
  InvoiceListQuery,
} from "./billing";
import {
  CreateDeliveryNoteInput,
  DeliveryNote,
  DeliveryNoteDetail,
  DeliveryNoteListQuery,
  DeliveryNoteListResponse,
  RemitoStatusHistoryEntry,
  RemitoTransitionInput,
  UpdateDeliveryNoteInput,
} from "./delivery-note";
import {
  CreateDriverProfileInput,
  CreateRemitoIncidentInput,
  CreateRemitoLineInput,
  CreateVehicleInput,
  DriverListQuery,
  DriverProfile,
  PrintRemitoPdfQuery,
  RemitoIncident,
  RemitoLine,
  RemitoPrintLog,
  RemitoSeries,
  UpdateRemitoIncidentInput,
  UpdateRemitoLineInput,
  Vehicle,
  VehicleListQuery,
  Warehouse,
  WarehouseListQuery,
} from "./remito-ops";
import {
  ArcaCompanyProfile,
  ArcaConnectionStatus,
  ArcaDashboard,
  ArcaEnvironment,
  ArcaEnvironmentQuery,
  ArcaOnboardingStatus,
  ArcaTestingMode,
  ConnectionTestResult,
  DeleteArcaCertificateInput,
  GenerateArcaKeysInput,
  UpdateArcaCompanyProfileInput,
  UpdateArcaTestingModeInput,
  UploadCertificateResult,
  ValidateCertificateResult,
} from "./arca";
import { Money, IsoDate } from "./common";
import { GasCode, IncidentType, PrintCopyKind, RemitoStatus } from "./enums";
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
    assert.equal(
      CreateMovementInput.parse({
        cylinder_id: 10,
        holder_party_id: 20,
        movement_kind: "SALE",
        delivery_date: "2026-07-01",
      }).movement_kind,
      "SALE",
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
        remito_type: "DELIVERY",
        status: "DRAFT",
        picking_status: "PENDING",
        priority: "NORMAL",
        issued_date: "2018-05-04",
        client_party_id: 501,
        client_name: "Acme",
      }).remito_number,
      "1475",
    );
    assert.equal(
      CreateDeliveryNoteInput.parse({ remito_number: " 1475 " }).priority,
      "NORMAL",
    );
    assert.equal(
      CreateDeliveryNoteInput.parse({
        remito_number: "90",
        remito_type: "CYLINDER_RETURN",
      }).remito_type,
      "CYLINDER_RETURN",
    );
    assert.throws(() => CreateDeliveryNoteInput.parse({ remito_number: "" }));
    const query = DeliveryNoteListQuery.parse({
      q: "1475",
      "filter[client_party_id]": "501",
      "filter[kind]": "RETURN",
      "filter[status]": "DRAFT",
    });
    assert.equal(query.sort, "-issued_date");
    assert.equal(query["filter[client_party_id]"], 501);
    assert.equal(query["filter[kind]"], "RETURN");
    assert.equal(query["filter[status]"], "DRAFT");
    assert.equal(
      DeliveryNoteDetail.parse({
        id: 1,
        remito_number: "1475",
        kind: "DELIVERY",
        remito_type: "DELIVERY",
        status: "CLOSED",
        picking_status: "LOADED",
        priority: "NORMAL",
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

describe("arca", () => {
  it("parses dashboard without secret fields", () => {
    const parsed = ArcaDashboard.parse({
      environment: "HOMOLOGATION",
      status: "NOT_STARTED",
      checks: {
        has_private_key: false,
        has_csr: false,
        has_certificate: false,
        is_validated: false,
      },
      company: {
        cuit: null,
        legal_name: null,
        alias: null,
        point_of_sale: 1,
      },
      testing_mode: true,
      simulation_mode: false,
      effective_environment: "HOMOLOGATION",
      certificate_fingerprint: null,
      valid_until: null,
      last_validation: null,
      last_authentication: null,
      connection_status: "NOT_CONFIGURED",
      last_connection_error: null,
      last_invoice: null,
      last_cae: null,
      point_of_sale: 1,
    });
    assert.equal(parsed.status, "NOT_STARTED");
    assert.ok(!("private_key" in parsed));
  });

  it("transforms and validates company profile updates", () => {
    assert.deepEqual(
      UpdateArcaCompanyProfileInput.parse({
        cuit: "",
        legal_name: "  ",
        alias: null,
      }),
      { cuit: null, legal_name: null, alias: null },
    );
    assert.equal(
      UpdateArcaCompanyProfileInput.parse({
        cuit: "20-12345678-6",
        point_of_sale: 3,
      }).point_of_sale,
      3,
    );
    assert.throws(() => UpdateArcaCompanyProfileInput.parse({}));
    assert.equal(
      ArcaCompanyProfile.parse({
        cuit: "20-12345678-6",
        legal_name: "Weld",
        alias: "W",
        point_of_sale: 1,
      }).cuit,
      "20-12345678-6",
    );
  });

  it("parses keys, testing mode, and result payloads", () => {
    assert.equal(ArcaEnvironmentQuery.parse({}).environment, "HOMOLOGATION");
    assert.equal(
      GenerateArcaKeysInput.parse({ environment: "PRODUCTION" }).environment,
      "PRODUCTION",
    );
    assert.throws(() =>
      DeleteArcaCertificateInput.parse({
        environment: "HOMOLOGATION",
        reason: "",
      }),
    );
    assert.equal(ArcaTestingMode.parse({ enabled: true }).enabled, true);
    assert.equal(
      UpdateArcaTestingModeInput.parse({
        enabled: false,
        confirm_go_live: true,
      }).confirm_go_live,
      true,
    );
    assert.equal(
      UploadCertificateResult.parse({
        ok: true,
        message: "ok",
        status: "CERT_UPLOADED",
      }).status,
      "CERT_UPLOADED",
    );
    assert.equal(
      ValidateCertificateResult.parse({
        ok: true,
        checks: [{ id: "VALID_X509", passed: true, message: "ok" }],
        fingerprint: "abc",
        valid_until: "2030-01-01T00:00:00.000Z",
      }).ok,
      true,
    );
    assert.equal(
      ConnectionTestResult.parse({
        ok: true,
        steps: [{ id: "WSAA_OK", passed: true, message: "ok" }],
        last_voucher_number: 12,
        connection_status: "CONNECTED",
      }).last_voucher_number,
      12,
    );
  });
});

describe("remito-ops schemas", () => {
  it("defaults line/incident creates and validates print query", () => {
    assert.equal(CreateRemitoLineInput.parse({}).item_kind, "CYLINDER");
    assert.equal(CreateRemitoLineInput.parse({}).qty, 1);
    assert.equal(UpdateRemitoLineInput.parse({ qty: "2" }).qty, 2);
    assert.equal(
      CreateRemitoIncidentInput.parse({
        type: "CYLINDER_DAMAGED",
        description: "dent",
      }).severity,
      "MEDIUM",
    );
    assert.equal(
      UpdateRemitoIncidentInput.parse({ status: "RESOLVED" }).status,
      "RESOLVED",
    );
    assert.equal(PrintRemitoPdfQuery.parse({}).copy, "ORIGINAL");
    assert.throws(() => PrintRemitoPdfQuery.parse({ copy: "REIMPRESION" }));
    assert.equal(
      PrintRemitoPdfQuery.parse({
        copy: "REIMPRESION",
        reason: "client copy",
      }).reason,
      "client copy",
    );
  });

  it("parses fleet create inputs and warehouse", () => {
    assert.equal(
      CreateVehicleInput.parse({ plate: "AB123CD" }).plate,
      "AB123CD",
    );
    assert.equal(
      CreateDriverProfileInput.parse({ display_name: "Ana" })
        .is_helper_eligible,
      true,
    );
    assert.equal(
      Warehouse.parse({
        id: 1,
        code: "MAIN",
        name: "Main",
        territory_id: null,
        is_active: true,
      }).code,
      "MAIN",
    );
    assert.equal(
      Vehicle.parse({
        id: 2,
        plate: "AB123CD",
        name: null,
        is_active: true,
      }).plate,
      "AB123CD",
    );
    assert.equal(
      DriverProfile.parse({
        id: 3,
        user_id: null,
        display_name: "Ana",
        is_helper_eligible: true,
        is_active: true,
      }).display_name,
      "Ana",
    );
    assert.equal(
      RemitoSeries.parse({
        id: 1,
        code: "R",
        pad_width: 8,
        next_number: 10,
        is_active: true,
      }).next_number,
      10,
    );
    assert.equal(
      RemitoLine.parse({
        id: 1,
        remito_id: 9,
        line_no: 1,
        item_kind: "CYLINDER",
        cylinder_id: 5,
        serial_number: "S1",
        is_rental: true,
        qty: 1,
        picked_qty: 0,
      }).item_kind,
      "CYLINDER",
    );
    assert.equal(
      RemitoIncident.parse({
        id: 1,
        remito_id: 9,
        line_id: null,
        type: "LEAK",
        severity: "HIGH",
        status: "OPEN",
        description: "leak",
        reported_at: "2026-07-24T12:00:00.000Z",
      }).type,
      "LEAK",
    );
    assert.equal(
      RemitoPrintLog.parse({
        id: 1,
        remito_id: 9,
        copy_kind: "ORIGINAL",
        reprint_seq: null,
        reason: null,
        printed_by: 1,
        printed_at: "2026-07-24T12:00:00.000Z",
      }).copy_kind,
      "ORIGINAL",
    );
    assert.equal(WarehouseListQuery.parse({}).limit, 50);
    assert.equal(VehicleListQuery.parse({ q: "AB" }).q, "AB");
    assert.equal(
      DriverListQuery.parse({ helpers_only: "true" }).helpers_only,
      true,
    );
    assert.equal(PrintCopyKind.parse("DUPLICADO"), "DUPLICADO");
    assert.equal(IncidentType.parse("OTHER"), "OTHER");
  });
});

describe("billing schemas", () => {
  it("requires period dates and parses invoice ARCA fields", () => {
    assert.throws(() => CreateBillingRunInput.parse({ mode: "period" }));
    assert.equal(
      CreateBillingRunInput.parse({
        mode: "period",
        period_start: "2026-01-01",
        period_end: "2026-01-31",
      }).mode,
      "period",
    );
    assert.equal(
      CreateBillingRunInput.parse({ mode: "history" }).mode,
      "history",
    );
    assert.equal(
      InvoiceArcaAuthorization.parse({
        cae: "123",
        cae_due_date: "2026-08-01",
        cbte_tipo: 6,
        pto_vta: 1,
        cbte_nro: 10,
        cbte_fch: "2026-07-24",
        doc_tipo: 80,
        doc_nro: 20123456786,
        condicion_iva_receptor: 5,
        imp_neto: 100,
        imp_iva: 21,
        imp_total: 121,
        arca_environment: "HOMOLOGATION",
        arca_qr_url: null,
        authorized_at: "2026-07-24T12:00:00.000Z",
      }).cae,
      "123",
    );
    assert.equal(
      Invoice.parse({
        id: 1,
        client_party_id: 9,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        status: "APPROVED",
        total: 121,
        created_at: "2026-07-24T12:00:00.000Z",
        version: 1,
      }).status,
      "APPROVED",
    );
    assert.equal(
      ChargeLine.parse({
        id: 1,
        invoice_id: 1,
        source_table: "movement_event",
        source_id: 9,
        description: "rental",
        quantity: 3,
        unit: "day",
        unit_price: 10,
        amount: 30,
      }).amount,
      30,
    );
    assert.equal(
      BillingRun.parse({
        id: 1,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        client_party_id: null,
        status: "DRAFT",
        created_at: "2026-07-24T12:00:00.000Z",
      }).status,
      "DRAFT",
    );
    assert.equal(
      BillingRunDetail.parse({
        id: 1,
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        client_party_id: null,
        status: "DRAFT",
        created_at: "2026-07-24T12:00:00.000Z",
        invoices: [],
      }).invoices.length,
      0,
    );
    assert.equal(
      BillingExportPayload.parse({
        run_id: 1,
        exported_at: "2026-07-24T12:00:00.000Z",
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        invoices: [
          {
            invoice_id: 1,
            client_party_id: 9,
            total: 30,
            lines: [
              {
                source_table: "movement_event",
                source_id: 9,
                description: "rental",
                quantity: 3,
                unit: "day",
                unit_price: 10,
                amount: 30,
              },
            ],
          },
        ],
      }).run_id,
      1,
    );
    assert.equal(
      InvoiceListQuery.parse({ "filter[status]": "APPROVED" })[
        "filter[status]"
      ],
      "APPROVED",
    );
    assert.equal(Money.parse("12.50"), 12.5);
    assert.equal(IsoDate.parse("2026-07-24"), "2026-07-24");
  });
});

describe("delivery-note transitions", () => {
  it("parses update, transition, and list response", () => {
    assert.equal(
      UpdateDeliveryNoteInput.parse({
        version: 1,
        observations: "x",
      }).observations,
      "x",
    );
    assert.equal(
      RemitoTransitionInput.parse({ version: 2, note: "issue" }).version,
      2,
    );
    assert.equal(
      RemitoStatusHistoryEntry.parse({
        id: 1,
        from_status: null,
        to_status: "PREPARED",
        actor_user_id: 1,
        note: null,
        at: "2026-07-24T12:00:00.000Z",
      }).to_status,
      "PREPARED",
    );
    assert.equal(RemitoStatus.parse("CLOSED"), "CLOSED");
    assert.equal(GasCode.parse("O2"), "O2");
    assert.equal(ArcaEnvironment.parse("PRODUCTION"), "PRODUCTION");
    assert.equal(ArcaOnboardingStatus.parse("CONNECTED"), "CONNECTED");
    assert.equal(ArcaConnectionStatus.parse("FAILED"), "FAILED");
    assert.equal(
      DeliveryNoteListResponse.parse({
        data: [
          {
            id: 1,
            remito_number: "1",
            kind: "DELIVERY",
            remito_type: "DELIVERY",
            status: "DRAFT",
            picking_status: "PENDING",
            priority: "NORMAL",
            issued_date: "2026-01-01",
            client_party_id: 1,
            movement_count: 0,
            accessory_rental_count: 0,
          },
        ],
        page: {
          limit: 20,
          next_cursor: null,
          has_more: false,
          total_estimate: 1,
        },
      }).page.total_estimate,
      1,
    );
  });
});

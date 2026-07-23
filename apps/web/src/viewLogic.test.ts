import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiClientError } from "@weld/api-client";
import type { Client, MovementEvent } from "@weld/schemas";

import {
  cursorPageRowCount,
  paginationAfterChange,
  stashNextCursor,
  shouldResetCursors,
} from "./lib/cursorPagination";
import { formatDateDMY, monthStartIso, todayIso } from "./lib/dateFormat";
import {
  alertSeverityColor,
  cylinderStateChipColor,
  loanStageChipColor,
  movementStateChipColor,
  transferCustodyChipColor,
} from "./lib/chipColors";
import {
  clientSortParam,
  cylinderSortParam,
  movementSortParam,
} from "./lib/sortParam";
import {
  cylinderPickerLabel,
  isRefillPickable,
  isRentalPickable,
} from "./features/movements/movementLogic";
import { partyTypeLabel } from "./features/transfers/transferLogic";
import {
  formatLoanDate,
  nextLoanStage,
} from "./features/supplier-loans/loanLogic";
import {
  formatInvoiceDaysBreakdown,
  invoiceDaysBreakdownParams,
  invoiceTotalDays,
} from "./features/billing/billingLogic";
import { formatActorLabel } from "./features/audit/auditLogic";
import {
  formatBytes,
  migrationErrorMessage,
} from "./features/migration/migrationLogic";
import { toClientFormValues } from "./features/clients/clientFormLogic";
import { clientCustodyLabel } from "./features/clients/clientLedgerLogic";
import { homePathForCapabilities } from "./auth/homePath";
import {
  allTerritoriesSelected,
  emptyUserDraft,
  findExistingTerritory,
  nextTerritorySelection,
} from "./features/users/userFormLogic";

describe("cursorPagination", () => {
  it("stashes next cursor and computes row counts", () => {
    assert.deepEqual(stashNextCursor([undefined], 0, "abc"), [
      undefined,
      "abc",
    ]);
    assert.deepEqual(stashNextCursor([undefined], 0, undefined), [undefined]);
    assert.equal(cursorPageRowCount(1, 50, 20, true), 71);
    assert.equal(cursorPageRowCount(0, 50, 50, false), 50);
    assert.equal(shouldResetCursors(100, 50), true);
    assert.equal(shouldResetCursors(50, 50), false);
    assert.deepEqual(
      paginationAfterChange(
        { page: 2, pageSize: 50 },
        { page: 3, pageSize: 50 },
      ),
      { pagination: { page: 3, pageSize: 50 }, resetCursors: false },
    );
    assert.deepEqual(
      paginationAfterChange(
        { page: 2, pageSize: 50 },
        { page: 2, pageSize: 100 },
      ),
      { pagination: { page: 0, pageSize: 100 }, resetCursors: true },
    );
  });
});

describe("dateFormat", () => {
  it("formats DMY and todayIso", () => {
    assert.equal(formatDateDMY(null), "—");
    assert.equal(formatDateDMY(""), "—");
    assert.equal(formatDateDMY("2024-03-05"), "05/03/2024");
    assert.equal(formatDateDMY("bad"), "bad");
    assert.equal(formatDateDMY("not-a-date"), "date/a/not");
    assert.equal(formatLoanDate("2024-01-02"), "02/01/2024");
    const fixed = todayIso(new Date("2024-06-15T15:00:00.000Z"), "UTC");
    assert.equal(fixed, "2024-06-15");
    assert.equal(
      monthStartIso(new Date("2024-06-15T15:00:00.000Z"), "UTC"),
      "2024-06-01",
    );
  });
});

describe("sortParam", () => {
  it("builds client / cylinder / movement sort params", () => {
    assert.equal(clientSortParam([]), "name");
    assert.equal(clientSortParam([{ field: "name", sort: "desc" }]), "-name");
    assert.equal(clientSortParam([{ field: "nope", sort: "asc" }]), "name");
    assert.equal(
      clientSortParam([{ field: "outstanding_count", sort: "desc" }]),
      "-outstanding_count",
    );
    assert.equal(cylinderSortParam([]), "serial_number");
    assert.equal(cylinderSortParam([{ field: "state", sort: "asc" }]), "state");
    assert.equal(movementSortParam([]), "-delivery_date");
    assert.equal(
      movementSortParam([{ field: "rental_days", sort: "desc" }]),
      "-rental_days",
    );
  });
});

describe("chipColors", () => {
  it("maps severities and states", () => {
    assert.equal(alertSeverityColor(1), "info");
    assert.equal(alertSeverityColor(2), "warning");
    assert.equal(alertSeverityColor(3), "error");
    assert.equal(cylinderStateChipColor("AT_CLIENT"), "warning");
    assert.equal(cylinderStateChipColor("LOST"), "error");
    assert.equal(cylinderStateChipColor("IN_STOCK_FULL"), "success");
    assert.equal(cylinderStateChipColor("SOLD"), "secondary");
    assert.equal(cylinderStateChipColor("AT_SUPPLIER"), "info");
    assert.equal(cylinderStateChipColor("OTHER"), "default");
    assert.equal(transferCustodyChipColor("LOANED"), "warning");
    assert.equal(transferCustodyChipColor("REFILL"), "info");
    assert.equal(transferCustodyChipColor("CUSTODY"), "success");
    assert.equal(movementStateChipColor("OPEN", false), "warning");
    assert.equal(movementStateChipColor("CLOSED", true), "success");
    assert.equal(movementStateChipColor("SWAPPED", true), "info");
    assert.equal(movementStateChipColor("LOST", true), "error");
    assert.equal(movementStateChipColor("VOID", true), "default");
    assert.equal(loanStageChipColor("OUT_TO_CLIENT"), "warning");
    assert.equal(loanStageChipColor("BACK_FROM_CLIENT"), "info");
    assert.equal(loanStageChipColor("RETURNED_TO_SUPPLIER"), "success");
    assert.equal(loanStageChipColor("RECEIVED"), "default");
  });
});

describe("movementLogic", () => {
  const base = {
    state: "IN_STOCK_FULL" as const,
    ownership_basis: "OWNED" as const,
    packaging: "SINGLE" as const,
    current_movement_id: null as number | null,
    current_holder_party_id: null as number | null,
    serial_number: "S1",
    owner_name: "Acme",
    gas_code: "O2" as const | null,
  };

  it("evaluates rental and refill pickability", () => {
    assert.equal(isRentalPickable(base), true);
    assert.equal(
      isRentalPickable({ ...base, ownership_basis: "CUSTOMER" }),
      false,
    );
    assert.equal(
      isRentalPickable({ ...base, packaging: "BATTERY_MEMBER" }),
      false,
    );
    assert.equal(isRentalPickable({ ...base, current_movement_id: 1 }), false);
    assert.equal(isRentalPickable({ ...base, state: "AT_CLIENT" }), false);

    assert.equal(
      isRefillPickable({
        ownership_basis: "CUSTOMER",
        state: "AT_CLIENT",
        packaging: "SINGLE",
      }),
      true,
    );
    assert.equal(
      isRefillPickable({
        ownership_basis: "OWNED",
        state: "AT_CLIENT",
        packaging: "SINGLE",
      }),
      false,
    );
    assert.equal(
      isRefillPickable({
        ownership_basis: "CUSTOMER",
        state: "LOST",
        packaging: "SINGLE",
      }),
      false,
    );
    assert.equal(
      cylinderPickerLabel({
        serial_number: "X",
        owner_name: "O",
        gas_code: "N2",
      }),
      "X · O · N2",
    );
    assert.equal(
      cylinderPickerLabel({
        serial_number: "X",
        owner_name: undefined,
        gas_code: null,
      }),
      "X",
    );
  });
});

describe("transfer / loan / audit / migration", () => {
  it("labels and advances stages", () => {
    const translate = (key: string) =>
      key === "transfers.party_types.CLIENT" ? "Cliente" : key;
    assert.equal(partyTypeLabel(translate, "CLIENT"), "Cliente");
    assert.equal(partyTypeLabel(translate, "UNKNOWN"), "UNKNOWN");
    assert.equal(nextLoanStage("RECEIVED"), "OUT_TO_CLIENT");
    assert.equal(nextLoanStage("RETURNED_TO_SUPPLIER"), null);

    const ta = (key: string) => `t:${key}`;
    assert.equal(formatActorLabel({ actor_username: "admin" }, ta), "admin");
    assert.equal(
      formatActorLabel({ actor_user_id: 9 }, ta),
      "t:audit.unknown_user #9",
    );
    assert.equal(
      formatActorLabel({ source: "migration" }, ta),
      "t:audit.system_user",
    );
    assert.equal(formatActorLabel({ source: "api" }, ta), "—");

    assert.equal(formatBytes(500), "500 B");
    assert.equal(formatBytes(2048), "2.0 KB");
    assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MB");
    assert.equal(
      migrationErrorMessage(new ApiClientError("X", "api fail", 400)),
      "api fail",
    );
    assert.equal(migrationErrorMessage(new Error("boom")), "boom");
    assert.equal(migrationErrorMessage(42), "42");
  });
});

describe("billingLogic", () => {
  it("summarizes day breakdowns", () => {
    assert.equal(
      invoiceTotalDays({ charge_lines: [{ quantity: 3 }, { quantity: 2 }] }),
      5,
    );
    assert.equal(
      invoiceTotalDays({ total_days: 9, charge_lines: [{ quantity: 1 }] }),
      9,
    );
    assert.deepEqual(invoiceDaysBreakdownParams({ charge_lines: [] }), {
      kind: "empty",
      cylinders: 0,
      total: 0,
    });
    assert.equal(
      invoiceDaysBreakdownParams({
        charge_lines: [{ quantity: 4 }, { quantity: 4 }],
      }).kind,
      "uniform",
    );
    assert.equal(
      invoiceDaysBreakdownParams({
        charge_lines: [{ quantity: 4 }, { quantity: 2 }],
      }).kind,
      "mixed",
    );
    const translate = (key: string, opts?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(opts ?? {})}`;
    assert.equal(
      formatInvoiceDaysBreakdown({ charge_lines: [] }, translate),
      "—",
    );
    assert.match(
      formatInvoiceDaysBreakdown(
        { charge_lines: [{ quantity: 2 }, { quantity: 2 }] },
        translate,
      ),
      /uniform/,
    );
    assert.match(
      formatInvoiceDaysBreakdown(
        { charge_lines: [{ quantity: 2 }, { quantity: 3 }] },
        translate,
      ),
      /mixed/,
    );
  });
});

describe("clientFormLogic / clientLedgerLogic", () => {
  it("builds form defaults and custody labels", () => {
    const empty = toClientFormValues(null, 7);
    assert.equal(empty.territory_id, 7);
    assert.equal(empty.contacts?.length, 1);

    const client = {
      id: 1,
      name: "Acme",
      cuit: "20-1",
      address_street: "St",
      locality_id: 2,
      territory_id: 3,
      coverage: "PRIVATE",
      segment: null,
      delivery_instructions: null,
      contacts: [{ name: "A", phone: "1", role: null, is_primary: true }],
    } as unknown as Client;
    assert.equal(toClientFormValues(client, 7).name, "Acme");
    assert.equal(
      toClientFormValues({ ...client, contacts: [] } as unknown as Client, 7)
        .contacts?.[0]?.is_primary,
      true,
    );

    const translate = ((key: string) => key) as never;
    const openRental: Pick<
      MovementEvent,
      "state" | "return_date" | "movement_kind"
    > = { state: "OPEN", return_date: null, movement_kind: "RENTAL" };
    assert.equal(
      clientCustodyLabel(openRental, translate),
      "clients.detail.custody.on_loan",
    );
    assert.equal(
      clientCustodyLabel(
        { state: "OPEN", return_date: null, movement_kind: "REFILL" },
        translate,
      ),
      "clients.detail.custody.refill_open",
    );
    assert.equal(
      clientCustodyLabel(
        { state: "CLOSED", return_date: "2024-01-01", movement_kind: "RENTAL" },
        translate,
      ),
      "clients.detail.custody.returned",
    );
    assert.equal(
      clientCustodyLabel(
        { state: "CLOSED", return_date: "2024-01-01", movement_kind: "REFILL" },
        translate,
      ),
      "clients.detail.custody.refill_closed",
    );
    assert.equal(
      clientCustodyLabel(
        { state: "SWAPPED", return_date: null, movement_kind: "RENTAL" },
        translate,
      ),
      "enums.movement_state.SWAPPED",
    );
    assert.equal(
      clientCustodyLabel(
        { state: "LOST", return_date: null, movement_kind: "RENTAL" },
        translate,
      ),
      "enums.movement_state.LOST",
    );
    assert.equal(
      clientCustodyLabel(
        { state: "SOLD", return_date: null, movement_kind: "RENTAL" },
        translate,
      ),
      "enums.movement_state.SOLD",
    );
  });
});

describe("userFormLogic", () => {
  it("creates empty drafts and matches territories", () => {
    const data = emptyUserDraft();
    assert.equal(data.username, "");
    assert.deepEqual(data.roles, ["CLERK"]);
    assert.equal(
      findExistingTerritory(" Norte ", [
        { id: 1, name: "norte" },
        { id: 2, name: "Sur" },
      ])?.id,
      1,
    );
    assert.equal(
      findExistingTerritory("  ", [{ id: 1, name: "a" }]),
      undefined,
    );
  });

  it("toggles selecting every territory", () => {
    const available = [1, 2, 3];
    assert.equal(allTerritoriesSelected([], available), false);
    assert.equal(allTerritoriesSelected([1, 2], available), false);
    assert.equal(allTerritoriesSelected([1, 2, 3], available), true);
    assert.equal(allTerritoriesSelected([], []), false);
    assert.deepEqual(nextTerritorySelection([1], available), [1, 2, 3]);
    assert.deepEqual(nextTerritorySelection([1, 2, 3], available), []);
  });
});

describe("homePathForCapabilities", () => {
  it("picks the first granted route and falls back to settings", () => {
    assert.equal(homePathForCapabilities(["clients:read"]), "/clients");
    assert.equal(
      homePathForCapabilities(["cylinders:read", "movements:read"]),
      "/cylinders",
    );
    assert.equal(homePathForCapabilities(["admin:write"]), "/settings");
    assert.equal(homePathForCapabilities([]), "/settings");
    assert.equal(homePathForCapabilities(null), "/settings");
  });
});

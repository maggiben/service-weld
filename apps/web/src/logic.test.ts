import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import { displayRentalDays } from "./features/movements/displayRentalDays";
import {
  formatAlertDetail,
  alertEntityHref,
} from "./features/alerts/alertDisplay";
import { applyServerErrors } from "./hooks/useServerErrors";
import { useNotificationStore } from "./store/notificationStore";
import { selectThemeMode, useUiStore } from "./store/uiStore";
import {
  buildTheme,
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  isThemeId,
  listThemePresets,
  preferredThemeForMode,
  resolveThemeId,
  resolveThemeIdForMode,
} from "./theme";
import {
  dashIfEmpty,
  formatPartyLabel,
  clampPercent,
  pluralize,
  boolLabel,
} from "./lib/format";
import { userInitials } from "./lib/userInitials";
import { ApiClientError } from "@weld/api-client";
import type { Alert } from "@weld/schemas";

describe("userInitials", () => {
  it("takes the first two letters", () => {
    assert.equal(userInitials("admin"), "AD");
    assert.equal(userInitials("driver.leo"), "DR");
    assert.equal(userInitials("a"), "A");
    assert.equal(userInitials(""), "?");
    assert.equal(userInitials(null), "?");
  });
});

describe("displayRentalDays", () => {
  it("covers all branches", () => {
    assert.equal(
      displayRentalDays({
        rental_days: null,
        state: "OPEN",
        movement_kind: "REFILL",
      }),
      "—",
    );
    assert.equal(
      displayRentalDays({
        rental_days: null,
        state: "CLOSED",
        movement_kind: "SUPPLIER_LOAN",
      }),
      "—",
    );
    assert.equal(
      displayRentalDays({
        rental_days: 5,
        state: "CLOSED",
        movement_kind: "RENTAL",
      }),
      5,
    );
    assert.equal(
      displayRentalDays({
        rental_days: null,
        state: "CLOSED",
        movement_kind: "RENTAL",
      }),
      "—",
    );
    assert.equal(
      displayRentalDays({
        rental_days: null,
        state: "OPEN",
        delivery_date: null,
        movement_kind: "RENTAL",
      }),
      "—",
    );
    assert.equal(
      typeof displayRentalDays({
        rental_days: null,
        state: "OPEN",
        delivery_date: "2024-01-01",
        movement_kind: "RENTAL",
      }),
      "number",
    );
    assert.equal(
      displayRentalDays({
        rental_days: null,
        state: "OPEN",
        delivery_date: "bad",
        movement_kind: "RENTAL",
      }),
      "—",
    );
  });
});

describe("alertDisplay", () => {
  const t = ((key: string, opts?: Record<string, unknown>) => {
    if (opts?.serial) return `cyl:${opts.serial}`;
    if (opts?.name) return `name:${opts.name}`;
    if (opts?.count != null) return `days:${opts.count}`;
    if (opts?.defaultValue) return String(opts.defaultValue);
    return key;
  }) as never;

  function alert(over: Partial<Alert> = {}): Alert {
    return {
      id: 1,
      alert_type: "LONG_OUTSTANDING",
      entity_table: "movement_event",
      entity_id: 1,
      severity: 1,
      created_at: "2024-01-01T00:00:00.000Z",
      resolved_at: null,
      assigned_role: null,
      summary: "fallback",
      cylinder_id: 9,
      cylinder_serial: "S1",
      client_party_id: 2,
      client_name: "Acme",
      counterparty_name: "Sup",
      days_open: 40,
      gas_code: "O2",
      loan_stage: "RECEIVED",
      movement_kind: "RENTAL",
      ...over,
    };
  }

  it("formats known types and hrefs", () => {
    assert.match(formatAlertDetail(alert(), t), /cyl:S1/);
    assert.match(
      formatAlertDetail(
        alert({
          cylinder_serial: null,
          client_name: null,
          days_open: null,
          gas_code: null,
          movement_kind: null,
        }),
        t,
      ),
      /.*/,
    );
    assert.match(
      formatAlertDetail(alert({ alert_type: "SUPPLIER_LOAN_OVERDUE" }), t),
      /Sup/,
    );
    assert.match(
      formatAlertDetail(
        alert({
          alert_type: "SUPPLIER_LOAN_OVERDUE",
          counterparty_name: null,
          loan_stage: null,
          client_name: null,
          cylinder_serial: null,
          days_open: null,
        }),
        t,
      ),
      /.*/,
    );
    assert.match(
      formatAlertDetail(alert({ alert_type: "SUPPLIER_LIABILITY" }), t),
      /cyl:S1/,
    );
    assert.match(
      formatAlertDetail(
        alert({
          alert_type: "SUPPLIER_LIABILITY",
          cylinder_serial: null,
          client_name: null,
          counterparty_name: null,
          gas_code: null,
        }),
        t,
      ),
      /.*/,
    );
    assert.equal(
      formatAlertDetail(alert({ alert_type: "OTHER", summary: "x" }), t),
      "x",
    );
    assert.equal(
      formatAlertDetail(alert({ alert_type: "OTHER", summary: undefined }), t),
      "",
    );
    assert.equal(alertEntityHref(alert()), "/cylinders/9");
    assert.equal(alertEntityHref(alert({ cylinder_id: null })), "/clients/2");
    assert.equal(
      alertEntityHref(alert({ cylinder_id: null, client_party_id: null })),
      null,
    );
  });
});

describe("applyServerErrors", () => {
  it("covers 422 / non-422 / fallback paths", () => {
    const setError = (() => undefined) as never;
    assert.equal(applyServerErrors(new Error("x"), setError), false);
    assert.equal(
      applyServerErrors(new ApiClientError("X", "m", 400), setError),
      false,
    );
    assert.equal(
      applyServerErrors(
        new ApiClientError("VALIDATION_FAILED", "bad", 422, [
          { field: "name", issue: "required" },
        ]),
        setError,
      ),
      true,
    );
    assert.equal(
      applyServerErrors(
        new ApiClientError("VALIDATION_FAILED", "msg", 422, []),
        setError,
      ),
      true,
    );
    assert.equal(
      applyServerErrors(
        new ApiClientError("VALIDATION_FAILED", "msg", 422, []),
        setError,
        "name",
      ),
      true,
    );
  });
});

describe("format helpers", () => {
  it("covers all helpers", () => {
    assert.equal(dashIfEmpty(null), "—");
    assert.equal(dashIfEmpty(""), "—");
    assert.equal(dashIfEmpty("  "), "—");
    assert.equal(dashIfEmpty("ok"), "ok");
    assert.equal(formatPartyLabel(3, "Acme"), "#3 Acme");
    assert.equal(clampPercent(Number.NaN), 0);
    assert.equal(clampPercent(-5), 0);
    assert.equal(clampPercent(150), 100);
    assert.equal(clampPercent(42), 42);
    assert.equal(pluralize(1, "día", "días"), "día");
    assert.equal(pluralize(2, "día", "días"), "días");
    assert.equal(boolLabel(true), "sí");
    assert.equal(boolLabel(false), "no");
    assert.equal(boolLabel(true, "yes", "no"), "yes");
  });
});

describe("stores", () => {
  beforeEach(() => {
    useNotificationStore.setState({ unreadCount: 0, toast: null });
  });

  it("notification store", () => {
    useNotificationStore.getState().setUnreadFromAlerts(2);
    useNotificationStore.getState().pushToast("hola");
    assert.equal(useNotificationStore.getState().unreadCount, 2);
    assert.equal(useNotificationStore.getState().toast, "hola");
    useNotificationStore.getState().clearToast();
    assert.equal(useNotificationStore.getState().toast, null);
  });
});

describe("theme presets", () => {
  it("exposes at least 4 light and 2 dark themes", () => {
    assert.ok(listThemePresets("light").length >= 4);
    assert.ok(listThemePresets("dark").length >= 2);
  });

  it("resolves ids and builds themes with readable text tokens", () => {
    assert.equal(resolveThemeId("nope"), DEFAULT_LIGHT_THEME_ID);
    assert.equal(isThemeId("weld-light"), true);
    assert.equal(isThemeId("nope"), false);
    assert.equal(
      preferredThemeForMode("dark", "weld-light", "midnight-dark"),
      "midnight-dark",
    );
    assert.equal(
      preferredThemeForMode("light", "slate-light", "charcoal-dark"),
      "slate-light",
    );
    // Wrong-mode or invalid last* ids must fall back to a listed preset.
    assert.equal(
      preferredThemeForMode("dark", "weld-light", "weld-light"),
      DEFAULT_DARK_THEME_ID,
    );
    assert.equal(
      preferredThemeForMode("light", "charcoal-dark", "midnight-dark"),
      DEFAULT_LIGHT_THEME_ID,
    );
    assert.equal(resolveThemeIdForMode("nope", "dark"), DEFAULT_DARK_THEME_ID);

    for (const preset of listThemePresets()) {
      const theme = buildTheme(preset.id);
      assert.equal(theme.palette.mode, preset.mode);
      assert.ok(theme.palette.text.primary);
      assert.ok(theme.palette.background.default);
      assert.ok(theme.palette.background.paper);
      assert.notEqual(
        theme.palette.text.primary.toLowerCase(),
        theme.palette.background.default.toLowerCase(),
      );
      assert.equal(preset.preview.text.length > 0, true);
    }
  });
});

describe("uiStore theme", () => {
  beforeEach(() => {
    useUiStore.setState({
      themeId: DEFAULT_LIGHT_THEME_ID,
      lastLightThemeId: DEFAULT_LIGHT_THEME_ID,
      lastDarkThemeId: DEFAULT_DARK_THEME_ID,
    });
  });

  it("remembers last light/dark picks when toggling mode", () => {
    useUiStore.getState().setThemeId("mist-light");
    useUiStore.getState().setThemeId("midnight-dark");
    assert.equal(useUiStore.getState().themeId, "midnight-dark");
    assert.equal(useUiStore.getState().lastLightThemeId, "mist-light");
    assert.equal(useUiStore.getState().lastDarkThemeId, "midnight-dark");

    useUiStore.getState().setMode("light");
    assert.equal(useUiStore.getState().themeId, "mist-light");
    useUiStore.getState().setMode("dark");
    assert.equal(useUiStore.getState().themeId, "midnight-dark");
    assert.equal(selectThemeMode(useUiStore.getState()), "dark");
  });

  it("sanitizes mismatched lastDark when toggling to dark", () => {
    useUiStore.setState({
      themeId: "mist-light",
      lastLightThemeId: "mist-light",
      // Legacy bug: resolveThemeId(invalid) stored a light id as lastDark.
      lastDarkThemeId: "weld-light",
    });
    useUiStore.getState().setMode("dark");
    assert.equal(useUiStore.getState().themeId, DEFAULT_DARK_THEME_ID);
    assert.equal(useUiStore.getState().lastDarkThemeId, DEFAULT_DARK_THEME_ID);
    assert.equal(selectThemeMode(useUiStore.getState()), "dark");
  });
});

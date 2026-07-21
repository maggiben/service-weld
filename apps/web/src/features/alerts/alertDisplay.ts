"use client";

import type { Alert } from "@weld/schemas";
import type { TFunction } from "i18next";

/** Secondary line for menus/tooltips (without repeating the alert type). */
export function formatAlertDetail(alert: Alert, t: TFunction): string {
  const cylinder = alert.cylinder_serial
    ? t("alerts.tokens.cylinder", { serial: alert.cylinder_serial })
    : null;
  const client = alert.client_name
    ? t("alerts.tokens.client", { name: alert.client_name })
    : null;
  const supplier = alert.counterparty_name
    ? t("alerts.tokens.supplier", { name: alert.counterparty_name })
    : null;
  const days =
    alert.days_open != null
      ? t("alerts.tokens.days", { count: alert.days_open })
      : null;
  const gas = alert.gas_code
    ? t(`enums.gas.${alert.gas_code}`, { defaultValue: alert.gas_code })
    : null;
  const stage = alert.loan_stage
    ? t(`enums.loan_stage.${alert.loan_stage}`, {
        defaultValue: alert.loan_stage,
      })
    : null;

  const kind = alert.movement_kind
    ? t(`enums.movement_kind.${alert.movement_kind}`)
    : null;

  switch (alert.alert_type) {
    case "LONG_OUTSTANDING":
      return [kind, cylinder, client, days, gas].filter(Boolean).join(" · ");
    case "SUPPLIER_LOAN_OVERDUE":
      return [cylinder, supplier, client, days, stage]
        .filter(Boolean)
        .join(" · ");
    case "SUPPLIER_LIABILITY":
      return [cylinder, client, supplier, gas].filter(Boolean).join(" · ");
    default:
      return alert.summary ?? "";
  }
}

export function alertEntityHref(alert: Alert): string | null {
  if (alert.cylinder_id != null) return `/cylinders/${alert.cylinder_id}`;
  if (alert.client_party_id != null) return `/clients/${alert.client_party_id}`;
  return null;
}

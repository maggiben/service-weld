import type { Alert } from "@weld/schemas";
import type { TFunction } from "i18next";

function present(value: string | null | undefined): value is string {
  return value != null && value !== "";
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter(present).join(" · ");
}

/** Secondary line for menus/tooltips (without repeating the alert type). */
export function formatAlertDetail(alert: Alert, translate: TFunction): string {
  const cylinder = present(alert.cylinder_serial)
    ? translate("alerts.tokens.cylinder", { serial: alert.cylinder_serial })
    : null;
  const client = present(alert.client_name)
    ? translate("alerts.tokens.client", { name: alert.client_name })
    : null;
  const supplier = present(alert.counterparty_name)
    ? translate("alerts.tokens.supplier", { name: alert.counterparty_name })
    : null;
  const days =
    alert.days_open != null
      ? translate("alerts.tokens.days", { count: alert.days_open })
      : null;
  const gas = present(alert.gas_code)
    ? translate(`enums.gas.${alert.gas_code}`, { defaultValue: alert.gas_code })
    : null;
  const stage = present(alert.loan_stage)
    ? translate(`enums.loan_stage.${alert.loan_stage}`, {
        defaultValue: alert.loan_stage,
      })
    : null;
  const kind = present(alert.movement_kind)
    ? translate(`enums.movement_kind.${alert.movement_kind}`)
    : null;

  switch (alert.alert_type) {
    case "LONG_OUTSTANDING":
      return joinParts([kind, cylinder, client, days, gas]);
    case "SUPPLIER_LOAN_OVERDUE":
      return joinParts([cylinder, supplier, client, days, stage]);
    case "SUPPLIER_LIABILITY":
      return joinParts([cylinder, client, supplier, gas]);
    default:
      return alert.summary ?? "";
  }
}

export function alertEntityHref(alert: Alert): string | null {
  if (alert.cylinder_id != null) return `/cylinders/${alert.cylinder_id}`;
  if (alert.client_party_id != null) return `/clients/${alert.client_party_id}`;
  return null;
}

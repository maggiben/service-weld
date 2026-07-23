import type { ClientAccountSummary, MovementState } from "@weld/schemas";
import type { TFunction } from "i18next";
import { formatDateDMY } from "../../lib/dateFormat";
import { movementStateChipColor } from "../../lib/chipColors";

export const formatLedgerDate = formatDateDMY;
export { movementStateChipColor };

type CustodyLabelRow = {
  state: MovementState;
  return_date: string | null;
  movement_kind: "RENTAL" | "REFILL" | "SUPPLIER_LOAN";
};

/** True when the custody cycle has ended (return, swap, loss, sale, etc.). */
export function isMovementReturned(
  row: Pick<CustodyLabelRow, "state" | "return_date">,
): boolean {
  return (
    row.return_date != null ||
    row.state === "CLOSED" ||
    row.state === "SWAPPED" ||
    row.state === "LOST" ||
    row.state === "SOLD" ||
    row.state === "VOID"
  );
}

/**
 * Operator-facing custody label (client ledger, cylinder history, movements).
 * Rentals: on loan / returned. Refills (customer-owned): in progress / refilled —
 * never "loan" or ticket-style wording for closed refills.
 */
export function clientCustodyLabel(
  row: CustodyLabelRow,
  translate: TFunction,
): string {
  const isRefill = row.movement_kind === "REFILL";
  const returned = isMovementReturned(row);

  if (returned) {
    if (row.state === "SWAPPED")
      return translate("enums.movement_state.SWAPPED");
    if (row.state === "LOST") return translate("enums.movement_state.LOST");
    if (row.state === "SOLD") return translate("enums.movement_state.SOLD");
    if (row.state === "VOID") return translate("enums.movement_state.VOID");
    return isRefill
      ? translate("clients.detail.custody.refill_closed")
      : translate("clients.detail.custody.returned");
  }

  if (row.state === "OPEN") {
    return isRefill
      ? translate("clients.detail.custody.refill_open")
      : translate("clients.detail.custody.on_loan");
  }
  return translate(`enums.movement_state.${row.state as MovementState}`);
}

function formatMoney(amount: number): string {
  return Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatOpenRentalDailyRate(
  summary: Pick<
    ClientAccountSummary,
    "open_rental_daily_rate_min" | "open_rental_daily_rate_max"
  >,
  translate: TFunction,
): string {
  const min = summary.open_rental_daily_rate_min;
  const max = summary.open_rental_daily_rate_max;
  if (min == null || max == null) return "—";
  if (min === max) {
    return translate("billing.columns.daily_rate_value", {
      price: formatMoney(min),
    });
  }
  return translate("billing.columns.daily_rate_mixed", {
    min: formatMoney(min),
    max: formatMoney(max),
  });
}

/** Secondary line for the open-rentals KPI: days · rate · owed. */
export function formatOpenRentalsKpiDetail(
  summary: Pick<
    ClientAccountSummary,
    | "open_rental_days"
    | "open_rental_daily_rate_min"
    | "open_rental_daily_rate_max"
    | "open_rental_owed"
  >,
  translate: TFunction,
): string {
  const rate = formatOpenRentalDailyRate(summary, translate);
  const owed =
    summary.open_rental_owed == null
      ? "—"
      : translate("clients.detail.kpi.owed_value", {
          amount: formatMoney(summary.open_rental_owed),
        });
  return translate("clients.detail.kpi.rentals_detail", {
    days: summary.open_rental_days,
    rate,
    owed,
  });
}

import type { MovementEvent, MovementState } from "@weld/schemas";
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

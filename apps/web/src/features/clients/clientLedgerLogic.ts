import type { MovementEvent, MovementState } from "@weld/schemas";
import type { TFunction } from "i18next";
import { formatDateDMY } from "../../lib/dateFormat";
import { movementStateChipColor } from "../../lib/chipColors";

export const formatLedgerDate = formatDateDMY;
export { movementStateChipColor };

/**
 * Client-facing custody label.
 * Rentals: on-loan / returned. Refills (customer-owned): in progress / closed —
 * never "loan" wording, since the cylinder is already theirs.
 */
export function clientCustodyLabel(
  row: Pick<MovementEvent, "state" | "return_date" | "movement_kind">,
  translate: TFunction,
): string {
  const isRefill = row.movement_kind === "REFILL";
  const returned =
    row.return_date != null ||
    row.state === "CLOSED" ||
    row.state === "SWAPPED" ||
    row.state === "LOST" ||
    row.state === "SOLD";

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

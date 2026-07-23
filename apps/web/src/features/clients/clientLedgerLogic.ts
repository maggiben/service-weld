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
  t: TFunction,
): string {
  const isRefill = row.movement_kind === "REFILL";
  const returned =
    row.return_date != null ||
    row.state === "CLOSED" ||
    row.state === "SWAPPED" ||
    row.state === "LOST" ||
    row.state === "SOLD";

  if (returned) {
    if (row.state === "SWAPPED") return t("enums.movement_state.SWAPPED");
    if (row.state === "LOST") return t("enums.movement_state.LOST");
    if (row.state === "SOLD") return t("enums.movement_state.SOLD");
    if (row.state === "VOID") return t("enums.movement_state.VOID");
    return isRefill
      ? t("clients.detail.custody.refill_closed")
      : t("clients.detail.custody.returned");
  }

  if (row.state === "OPEN") {
    return isRefill
      ? t("clients.detail.custody.refill_open")
      : t("clients.detail.custody.on_loan");
  }
  return t(`enums.movement_state.${row.state as MovementState}`);
}

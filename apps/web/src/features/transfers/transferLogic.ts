import type { TransferCustodyStatus } from "@weld/schemas";
import { transferCustodyChipColor } from "../../lib/chipColors";

export { transferCustodyChipColor };

export function partyTypeLabel(
  t: (key: string) => string,
  partyType: string,
): string {
  const key = `transfers.party_types.${partyType}`;
  const label = t(key);
  return label === key ? partyType : label;
}

export function isTransferCustodyStatus(
  value: string,
): value is TransferCustodyStatus {
  return value === "LOANED" || value === "REFILL" || value === "CUSTODY";
}

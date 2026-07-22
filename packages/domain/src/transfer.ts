import { DomainErrors } from "./errors";

export type TransferPartyType =
  "SELF" | "SUPPLIER" | "SUBDISTRIBUTOR" | "CUSTOMER";

/**
 * Where the cylinder sits as a result of the transfer (user-facing status).
 * - LOANED: sent to a client (préstamo / en poder del cliente)
 * - REFILL: sent to a supplier / filling plant (en recarga)
 * - CUSTODY: inside our network (hub/node) or already returned (en custodia)
 */
export type TransferCustodyStatus = "LOANED" | "REFILL" | "CUSTODY";

/** BR-14 / W16: origin and destination must be distinct structured parties. */
export function assertDistinctTransferParties(
  fromPartyId: number,
  toPartyId: number,
): void {
  if (fromPartyId === toPartyId) {
    throw DomainErrors.sameParty();
  }
}

/** return_date, when set, must be on or after transfer_date (salida). */
export function assertTransferReturnOrder(
  transferDate: string,
  returnDate: string | null | undefined,
): void {
  if (returnDate == null || returnDate === "") return;
  if (returnDate < transferDate) {
    throw DomainErrors.dateOrder();
  }
}

/**
 * Classify transfer for the grid pill.
 * Once returned (entrada), always CUSTODY — the cylinder is back with us.
 */
export function classifyTransferCustodyStatus(
  toPartyType: TransferPartyType,
  returnDate: string | null | undefined,
): TransferCustodyStatus {
  if (returnDate != null && returnDate !== "") {
    return "CUSTODY";
  }
  if (toPartyType === "CUSTOMER") return "LOANED";
  if (toPartyType === "SUPPLIER") return "REFILL";
  return "CUSTODY";
}

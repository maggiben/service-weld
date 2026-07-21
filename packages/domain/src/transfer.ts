import { DomainErrors } from "./errors";

/** BR-14 / W16: origin and destination must be distinct structured parties. */
export function assertDistinctTransferParties(
  fromPartyId: number,
  toPartyId: number,
): void {
  if (fromPartyId === toPartyId) {
    throw DomainErrors.sameParty();
  }
}

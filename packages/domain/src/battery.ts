import type { CylinderState, PackagingKind } from "@weld/schemas";
import { DomainErrors } from "./errors";
import { isTerminalCylinderState } from "./cylinder-state";

/** BR-13: battery must have ≥2 active members. */
export function assertBatteryMemberCount(count: number): void {
  if (count < 2) {
    throw DomainErrors.tooFewMembers();
  }
}

/**
 * A cylinder may join a battery only when in stock, not already packed,
 * and not circulating independently (BR-13).
 */
export function assertPackableAsBatteryMember(params: {
  packaging: PackagingKind;
  batteryId: number | null;
  state: CylinderState;
  ownerPartyId: number;
  batteryOwnerPartyId: number;
}): void {
  if (params.ownerPartyId !== params.batteryOwnerPartyId) {
    throw DomainErrors.memberOwnerMismatch();
  }
  if (params.batteryId != null || params.packaging === "BATTERY_MEMBER") {
    throw DomainErrors.memberAlreadyPacked();
  }
  if (isTerminalCylinderState(params.state)) {
    throw DomainErrors.cylinderTerminal(params.state);
  }
  if (params.state !== "IN_STOCK_EMPTY" && params.state !== "IN_STOCK_FULL") {
    throw DomainErrors.memberNotInStock();
  }
}

/** Packed members cannot be delivered alone (BR-13). */
export function assertNotPackedMember(packaging: PackagingKind): void {
  if (packaging === "BATTERY_MEMBER") {
    throw DomainErrors.memberAlreadyPacked();
  }
}

/** Replacement must be in stock; original terminal or being written off (W13). */
export function assertReplaceable(params: {
  originalState: CylinderState;
  replacementState: CylinderState;
}): void {
  if (
    params.replacementState !== "IN_STOCK_EMPTY" &&
    params.replacementState !== "IN_STOCK_FULL"
  ) {
    throw DomainErrors.replacementNotAvailable();
  }
  // Original may already be LOST/BROKEN/SOLD, or still AT_CLIENT (being swapped out).
  if (
    !isTerminalCylinderState(params.originalState) &&
    params.originalState !== "AT_CLIENT"
  ) {
    throw DomainErrors.illegalStateTransition(params.originalState, "RETIRED");
  }
}

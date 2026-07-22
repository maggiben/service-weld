/**
 * Domain errors — framework-light; mapped to API codes by the Nest layer.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const DomainErrors = {
  illegalStateTransition(from: string, to: string): DomainError {
    return new DomainError(
      "ILLEGAL_STATE_TRANSITION",
      `Cannot transition cylinder from ${from} to ${to}`,
    );
  },
  cylinderTerminal(state: string): DomainError {
    return new DomainError(
      "CYLINDER_TERMINAL",
      `Cylinder is in terminal state ${state}`,
    );
  },
  cylinderAlreadyOut(): DomainError {
    return new DomainError(
      "CYLINDER_ALREADY_OUT",
      "Cylinder already has an open movement",
    );
  },
  kindBasisMismatch(kind: string, basis: string): DomainError {
    return new DomainError(
      "KIND_BASIS_MISMATCH",
      `movement_kind ${kind} is inconsistent with ownership_basis ${basis}`,
    );
  },
  ownerBasisMismatch(partyType: string, basis: string): DomainError {
    return new DomainError(
      "OWNER_BASIS_MISMATCH",
      `ownership_basis ${basis} is inconsistent with party_type ${partyType}`,
    );
  },
  returnBeforeDelivery(): DomainError {
    return new DomainError(
      "RETURN_BEFORE_DELIVERY",
      "return_date must be on or after delivery_date",
    );
  },
  dateOutOfRange(field: string): DomainError {
    return new DomainError(
      "DATE_OUT_OF_RANGE",
      `${field} is outside the allowed range`,
    );
  },
  notOpen(): DomainError {
    return new DomainError("NOT_OPEN", "Movement is not OPEN");
  },
  alreadyTerminal(state: string): DomainError {
    return new DomainError(
      "ALREADY_TERMINAL",
      `Cylinder is already terminal (${state})`,
    );
  },
  returnedCylinderBusy(): DomainError {
    return new DomainError(
      "RETURNED_CYLINDER_BUSY",
      "Returned cylinder already has an open movement",
    );
  },
  tooFewMembers(): DomainError {
    return new DomainError(
      "TOO_FEW_MEMBERS",
      "Battery requires at least 2 members",
    );
  },
  memberAlreadyPacked(): DomainError {
    return new DomainError(
      "MEMBER_ALREADY_PACKED",
      "Cylinder is already in an active battery",
    );
  },
  memberOwnerMismatch(): DomainError {
    return new DomainError(
      "MEMBER_OWNER_MISMATCH",
      "Battery members must share the battery owner",
    );
  },
  memberNotInStock(): DomainError {
    return new DomainError(
      "MEMBER_NOT_IN_STOCK",
      "Only in-stock cylinders can join a battery",
    );
  },
  replacementNotAvailable(): DomainError {
    return new DomainError(
      "REPLACEMENT_NOT_AVAILABLE",
      "Replacement cylinder is not available in stock",
    );
  },
  stageOutOfOrder(from: string, to: string): DomainError {
    return new DomainError(
      "STAGE_OUT_OF_ORDER",
      `Cannot advance loan from ${from} to ${to}`,
    );
  },
  dateOrder(): DomainError {
    return new DomainError(
      "DATE_ORDER",
      "Loan stage dates must be non-decreasing",
    );
  },
  sameParty(): DomainError {
    return new DomainError(
      "SAME_PARTY",
      "Transfer origin and destination must differ",
    );
  },
  accessoryAlreadyOnLoan(): DomainError {
    return new DomainError(
      "ACCESSORY_ALREADY_ON_LOAN",
      "Accessory already has an open loan",
    );
  },
  notOnLoan(): DomainError {
    return new DomainError("NOT_ON_LOAN", "Accessory rental is not ON_LOAN");
  },
  accessoryOnLoanBlocksClose(): DomainError {
    return new DomainError(
      "ACCESSORY_ON_LOAN",
      "Client holds an accessory on loan (BR-10)",
    );
  },
  invalidCapacity(): DomainError {
    return new DomainError(
      "INVALID_CAPACITY",
      "capacity magnitude must be > 0 with unit M3 or KG",
    );
  },
  invalidMoney(): DomainError {
    return new DomainError("INVALID_MONEY", "Money amount must be >= 0");
  },
};

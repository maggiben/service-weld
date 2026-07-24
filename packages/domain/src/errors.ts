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
  cylinderHeldByClient(): DomainError {
    return new DomainError(
      "CYLINDER_HELD_BY_CLIENT",
      "Cylinder data cannot be edited while held by a client",
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
  illegalRemitoTransition(from: string, to: string): DomainError {
    return new DomainError(
      "ILLEGAL_STATE_TRANSITION",
      `Cannot transition remito from ${from} to ${to}`,
    );
  },
  remitoNotEditable(status: string): DomainError {
    return new DomainError(
      "REMITO_NOT_EDITABLE",
      `Remito in status ${status} cannot be edited`,
    );
  },
  remitoNotDeletable(status: string): DomainError {
    return new DomainError(
      "REMITO_NOT_DELETABLE",
      `Remito in status ${status} cannot be deleted`,
    );
  },
  cancelReasonRequired(): DomainError {
    return new DomainError(
      "CANCEL_REASON_REQUIRED",
      "Cancellation requires a reason",
    );
  },
  remitoAssignRequiresSchedule(): DomainError {
    return new DomainError(
      "REMITO_ASSIGN_REQUIRES_SCHEDULE",
      "Assigning a remito requires a scheduled delivery time",
    );
  },
  illegalArcaTransition(from: string, to: string): DomainError {
    return new DomainError(
      "ILLEGAL_STATE_TRANSITION",
      `Cannot advance ARCA setup from ${from} to ${to}`,
    );
  },
  arcaCuitRequired(): DomainError {
    return new DomainError(
      "ARCA_CUIT_REQUIRED",
      "Configure the company CUIT before generating an Access Request",
    );
  },
  arcaRegenerateRequiresConfirm(): DomainError {
    return new DomainError(
      "ARCA_REGENERATE_REQUIRES_CONFIRM",
      "Generating a new key will invalidate the existing certificate. Confirm to continue.",
    );
  },
  arcaCertificateExpired(): DomainError {
    return new DomainError(
      "ARCA_CERTIFICATE_EXPIRED",
      "This certificate has expired. Upload a new one before testing the connection.",
    );
  },
  arcaGoLiveRequiresConfirm(): DomainError {
    return new DomainError(
      "ARCA_GO_LIVE_REQUIRES_CONFIRM",
      "Confirm before disabling Testing Mode and using Live credentials.",
    );
  },
  arcaGoLiveRequiresProduction(): DomainError {
    return new DomainError(
      "ARCA_GO_LIVE_REQUIRES_PRODUCTION",
      "Live credentials must be connected before disabling Testing Mode.",
    );
  },
  arcaEncryptionKeyMissing(): DomainError {
    return new DomainError(
      "ARCA_ENCRYPTION_KEY_MISSING",
      "Server encryption key is not configured",
    );
  },
  arcaNotConnected(): DomainError {
    return new DomainError(
      "ARCA_NOT_CONNECTED",
      "ARCA credentials must be connected before authorizing an invoice",
    );
  },
  invoiceNotApproved(): DomainError {
    return new DomainError(
      "INVOICE_NOT_APPROVED",
      "Only approved or exported invoices can be authorized with ARCA",
    );
  },
  invoiceAlreadyAuthorized(): DomainError {
    return new DomainError(
      "INVOICE_ALREADY_AUTHORIZED",
      "This invoice already has a CAE",
    );
  },
  invoiceNotAuthorized(): DomainError {
    return new DomainError(
      "INVOICE_NOT_AUTHORIZED",
      "Authorize the invoice with ARCA before printing the fiscal PDF",
    );
  },
  invoiceCannotVoidWithArca(): DomainError {
    return new DomainError(
      "INVOICE_CANNOT_VOID_WITH_ARCA",
      "Authorized invoice is missing voucher fields required to issue a credit note",
    );
  },
  simulationModeRequired(): DomainError {
    return new DomainError(
      "SIMULATION_MODE_REQUIRED",
      "Invoice reset is only available when ARCA simulation mode is enabled",
    );
  },
  invoiceNothingToReset(): DomainError {
    return new DomainError(
      "INVOICE_NOTHING_TO_RESET",
      "Invoice is already a draft without ARCA authorization",
    );
  },
  arcaAuthorizationFailed(detail: string): DomainError {
    return new DomainError(
      "ARCA_AUTHORIZATION_FAILED",
      detail || "ARCA rejected the electronic invoice",
    );
  },
};

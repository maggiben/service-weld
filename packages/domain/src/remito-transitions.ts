import type { DeliveryNoteKind, RemitoStatus, RemitoType } from "@weld/schemas";
import { DomainErrors } from "./errors";

/** Paper kind (DELIVERY|RETURN) derived from operational remito type. */
export function paperKindForRemitoType(type: RemitoType): DeliveryNoteKind {
  switch (type) {
    case "CYLINDER_RETURN":
    case "ACCESSORY_RETURN":
    case "RENTAL_PICKUP":
      return "RETURN";
    default:
      return "DELIVERY";
  }
}

/** Default remito type when only legacy paper kind is known. */
export function remitoTypeForPaperKind(kind: DeliveryNoteKind): RemitoType {
  return kind === "RETURN" ? "CYLINDER_RETURN" : "DELIVERY";
}

const RETURN_LIKE: ReadonlySet<RemitoType> = new Set([
  "CYLINDER_RETURN",
  "ACCESSORY_RETURN",
  "RENTAL_PICKUP",
]);

export function isReturnLikeRemitoType(type: RemitoType): boolean {
  return RETURN_LIKE.has(type);
}

export function isDeliveryLikeRemitoType(type: RemitoType): boolean {
  return !RETURN_LIKE.has(type);
}

/**
 * Remito types that post cylinder custody (`movement_event`) on Aggregate close.
 * Transfers / adjustments / accessory-only returns are deferred.
 */
const CYLINDER_CUSTODY_ON_CLOSE: ReadonlySet<RemitoType> = new Set([
  "DELIVERY",
  "CYLINDER_RETURN",
  "CUSTOMER_PICKUP",
  "RENTAL_PICKUP",
  "RENTAL_DELIVERY",
]);

export function remitoPostsCylinderCustodyOnClose(type: RemitoType): boolean {
  return CYLINDER_CUSTODY_ON_CLOSE.has(type);
}

/** Remito types that open/close accessory rental rows on Aggregate close. */
const ACCESSORY_RENTAL_ON_CLOSE: ReadonlySet<RemitoType> = new Set([
  "DELIVERY",
  "ACCESSORY_RETURN",
  "CUSTOMER_PICKUP",
  "RENTAL_PICKUP",
  "RENTAL_DELIVERY",
]);

export function remitoPostsAccessoryRentalOnClose(type: RemitoType): boolean {
  return ACCESSORY_RENTAL_ON_CLOSE.has(type);
}

/** Customer-facing types that require a client on prepare. */
const CUSTOMER_FACING: ReadonlySet<RemitoType> = new Set([
  "DELIVERY",
  "CYLINDER_RETURN",
  "ACCESSORY_RETURN",
  "CUSTOMER_PICKUP",
  "RENTAL_PICKUP",
  "RENTAL_DELIVERY",
]);

export function isCustomerFacingRemitoType(type: RemitoType): boolean {
  return CUSTOMER_FACING.has(type);
}

/** Types that skip ASSIGNED / LOADED / IN_TRANSIT (depot counter). */
const SKIP_FLEET: ReadonlySet<RemitoType> = new Set([
  "CUSTOMER_PICKUP",
  "ADJUSTMENT",
  "INTERNAL_TRANSFER",
]);

export function remitoSkipsFleet(type: RemitoType): boolean {
  return SKIP_FLEET.has(type);
}

/** Format series emission number, e.g. A + 42 + pad 8 → `A-00000042`. */
export function formatRemitoSeriesNumber(
  code: string,
  sequence: number,
  padWidth: number,
): string {
  const width = Math.max(1, Math.trunc(padWidth));
  const seq = Math.max(0, Math.trunc(sequence));
  return `${code}-${String(seq).padStart(width, "0")}`;
}

const EDITABLE: ReadonlySet<RemitoStatus> = new Set(["DRAFT"]);

/**
 * Soft-delete header (R-76). Invoiced/archived stay immutable (R-7);
 * operational / closed remitos may leave the list without hard-delete.
 */
const NOT_SOFT_DELETABLE: ReadonlySet<RemitoStatus> = new Set([
  "INVOICED",
  "ARCHIVED",
]);

export function isRemitoHeaderEditable(status: RemitoStatus): boolean {
  return EDITABLE.has(status);
}

export function isRemitoSoftDeletable(status: RemitoStatus): boolean {
  return !NOT_SOFT_DELETABLE.has(status);
}

/**
 * Allowed remito status transitions (docs/specs/remitos.md §5).
 * CUSTOMER_PICKUP / ADJUSTMENT may take shortcuts via `assertRemitoTransition`.
 */
const TRANSITIONS: ReadonlyMap<
  RemitoStatus,
  ReadonlySet<RemitoStatus>
> = new Map([
  ["DRAFT", new Set(["PREPARED", "CANCELLED"])],
  ["PREPARED", new Set(["ASSIGNED", "CANCELLED"])],
  ["ASSIGNED", new Set(["LOADED", "CANCELLED"])],
  ["LOADED", new Set(["IN_TRANSIT", "CANCELLED"])],
  ["IN_TRANSIT", new Set(["DELIVERED", "CANCELLED"])],
  ["DELIVERED", new Set(["SIGNED", "CANCELLED"])],
  ["SIGNED", new Set(["CLOSED", "CANCELLED"])],
  ["CLOSED", new Set(["INVOICED"])],
  ["INVOICED", new Set(["ARCHIVED"])],
  ["ARCHIVED", new Set()],
  ["CANCELLED", new Set()],
]);

export interface RemitoTransitionContext {
  remitoType: RemitoType;
  /** Required when entering ASSIGNED (M1: ETA stands in for full fleet). */
  hasScheduledDeliveryAt?: boolean;
  /** Cancel transitions require a non-empty reason. */
  cancelReason?: string | null;
  /** Elevated cancel from DELIVERED/SIGNED. */
  elevatedCancel?: boolean;
}

export function allowedRemitoTransitions(
  from: RemitoStatus,
  remitoType: RemitoType,
): RemitoStatus[] {
  const base = TRANSITIONS.get(from);
  if (!base) return [];
  const next = new Set(base);
  // Depot pickup / adjustment: PREPARED may jump to DELIVERED (skip fleet).
  if (from === "PREPARED" && remitoSkipsFleet(remitoType)) {
    next.add("DELIVERED");
  }
  return [...next];
}

export function assertRemitoTransition(
  from: RemitoStatus,
  to: RemitoStatus,
  context: RemitoTransitionContext,
): void {
  if (from === to) {
    throw DomainErrors.illegalRemitoTransition(from, to);
  }

  const allowed = new Set(allowedRemitoTransitions(from, context.remitoType));
  const elevatedCancel =
    to === "CANCELLED" &&
    (from === "DELIVERED" || from === "SIGNED") &&
    Boolean(context.elevatedCancel);

  if (!allowed.has(to) && !elevatedCancel) {
    throw DomainErrors.illegalRemitoTransition(from, to);
  }

  if (to === "CANCELLED") {
    const reason = context.cancelReason?.trim() ?? "";
    if (!reason) {
      throw DomainErrors.cancelReasonRequired();
    }
  }

  if (to === "ASSIGNED" && !context.hasScheduledDeliveryAt) {
    throw DomainErrors.remitoAssignRequiresSchedule();
  }
}

export function assertRemitoEditable(status: RemitoStatus): void {
  if (!isRemitoHeaderEditable(status)) {
    throw DomainErrors.remitoNotEditable(status);
  }
}

export function assertRemitoSoftDeletable(status: RemitoStatus): void {
  if (!isRemitoSoftDeletable(status)) {
    throw DomainErrors.remitoNotDeletable(status);
  }
}

import type { MovementKind, OwnershipBasis } from "@weld/schemas";
import { DomainErrors } from "./errors";

export type PartyType = "SELF" | "SUPPLIER" | "SUBDISTRIBUTOR" | "CUSTOMER";

/**
 * BR-07 — ownership_basis must match the owner party's type.
 * SELF → OURS; SUPPLIER → SUPPLIER; CUSTOMER → CUSTOMER.
 * Sub-distributors holding our stock use OURS with SELF-owned serials,
 * or SUPPLIER when the unit is supplier-owned in their custody.
 */
export function assertOwnerBasisConsistency(
  partyType: PartyType,
  basis: OwnershipBasis,
): void {
  const ok =
    (basis === "OURS" &&
      (partyType === "SELF" || partyType === "SUBDISTRIBUTOR")) ||
    (basis === "SUPPLIER" && partyType === "SUPPLIER") ||
    (basis === "CUSTOMER" && partyType === "CUSTOMER");
  if (!ok) {
    throw DomainErrors.ownerBasisMismatch(partyType, basis);
  }
}

/**
 * BR-08 — REFILL ⇔ CUSTOMER-owned; RENTAL ⇔ OURS/SUPPLIER.
 * SALE only applies to cylinders we own (OURS): we cannot sell a
 * supplier's unit or a customer's own cylinder.
 */
export function assertKindBasisConsistency(
  kind: MovementKind,
  basis: OwnershipBasis,
): void {
  const refillOk = kind === "REFILL" && basis === "CUSTOMER";
  const rentalOk =
    kind === "RENTAL" && (basis === "OURS" || basis === "SUPPLIER");
  const saleOk = kind === "SALE" && basis === "OURS";
  if (!refillOk && !rentalOk && !saleOk) {
    throw DomainErrors.kindBasisMismatch(kind, basis);
  }
}

/**
 * Infer movement_kind from cylinder ownership when the caller omits it.
 */
export function movementKindForBasis(basis: OwnershipBasis): MovementKind {
  return basis === "CUSTOMER" ? "REFILL" : "RENTAL";
}

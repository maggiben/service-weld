import type { CylinderState } from "@weld/schemas";
import { DomainErrors } from "./errors";

/** Terminal cylinder states — no new rentals (BR-06). */
export const TERMINAL_CYLINDER_STATES: ReadonlySet<CylinderState> = new Set([
  "SOLD",
  "LOST",
  "BROKEN",
  "RETURNED_TO_SUPPLIER",
  "RETIRED",
]);

export function isTerminalCylinderState(state: CylinderState): boolean {
  return TERMINAL_CYLINDER_STATES.has(state);
}

/** States from which a delivery may open (stock → client). */
export const DELIVERABLE_STATES: ReadonlySet<CylinderState> = new Set([
  "IN_STOCK_EMPTY",
  "IN_STOCK_FULL",
]);

/**
 * Allowed cylinder state transitions (sdd.md §Cylinder lifecycle).
 * Partial map: only edges we enforce in Phase 2 walking skeleton.
 */
const TRANSITIONS: ReadonlyMap<
  CylinderState,
  ReadonlySet<CylinderState>
> = new Map<CylinderState, ReadonlySet<CylinderState>>([
  [
    "IN_STOCK_EMPTY",
    new Set([
      "IN_STOCK_FULL",
      "AT_CLIENT",
      "RETURNED_TO_SUPPLIER",
      "RETIRED",
      "LOST",
      "BROKEN",
    ]),
  ],
  [
    "IN_STOCK_FULL",
    new Set([
      "IN_STOCK_EMPTY",
      "AT_CLIENT",
      "AT_SUPPLIER",
      "SOLD",
      "LOST",
      "BROKEN",
    ]),
  ],
  [
    "AT_CLIENT",
    new Set(["IN_STOCK_EMPTY", "AT_CLIENT", "LOST", "BROKEN", "SOLD"]),
  ],
  ["AT_SUPPLIER", new Set(["IN_STOCK_EMPTY", "LOST", "BROKEN"])],
]);

export function assertCylinderTransition(
  from: CylinderState,
  to: CylinderState,
): void {
  if (from === to) return;
  if (isTerminalCylinderState(from)) {
    throw DomainErrors.cylinderTerminal(from);
  }
  const allowed = TRANSITIONS.get(from);
  if (!allowed?.has(to)) {
    throw DomainErrors.illegalStateTransition(from, to);
  }
}

/**
 * RENTAL: must leave plant stock (IN_STOCK_*).
 * REFILL (customer-owned): also allow AT_CLIENT between cycles — after a closed
 * refill the cylinder often remains recorded with the owner until the next fill
 * (W7 vacío→lleno); single-custody still blocks if an OPEN movement exists.
 */
export function assertDeliverable(
  state: CylinderState,
  opts?: { forRefill?: boolean },
): void {
  if (isTerminalCylinderState(state)) {
    throw DomainErrors.cylinderTerminal(state);
  }
  if (DELIVERABLE_STATES.has(state)) return;
  if (opts?.forRefill && state === "AT_CLIENT") return;
  throw DomainErrors.illegalStateTransition(state, "AT_CLIENT");
}

/** After a normal return, cylinder lands empty in stock. */
export function stateAfterReturn(): CylinderState {
  return "IN_STOCK_EMPTY";
}

export function stateAfterDelivery(): CylinderState {
  return "AT_CLIENT";
}

export function stateAfterLoss(outcome: "LOST" | "BROKEN"): CylinderState {
  return outcome;
}

/** Plant fill: empty stock → full stock, ready to dispatch (sdd fill edge). */
export function stateAfterFill(): CylinderState {
  return "IN_STOCK_FULL";
}

/** Plant empty: full stock → empty stock (correction / post-fill reverse). */
export function stateAfterEmpty(): CylinderState {
  return "IN_STOCK_EMPTY";
}

/**
 * Master data (gas, capacity, depot, acquisition) may only be edited while
 * the cylinder is not in client custody.
 */
export function isCylinderDataEditable(state: CylinderState): boolean {
  return state !== "AT_CLIENT";
}

export function assertCanEditCylinderData(state: CylinderState): void {
  if (!isCylinderDataEditable(state)) {
    throw DomainErrors.cylinderHeldByClient();
  }
}

/** Workshop may mark an empty in-stock cylinder as filled. */
export function assertCanFill(state: CylinderState): void {
  if (isTerminalCylinderState(state)) {
    throw DomainErrors.alreadyTerminal(state);
  }
  if (state !== "IN_STOCK_EMPTY") {
    throw DomainErrors.illegalStateTransition(state, "IN_STOCK_FULL");
  }
  assertCylinderTransition(state, "IN_STOCK_FULL");
}

/** Workshop may mark a full in-stock cylinder as empty. */
export function assertCanEmpty(state: CylinderState): void {
  if (isTerminalCylinderState(state)) {
    throw DomainErrors.alreadyTerminal(state);
  }
  if (state !== "IN_STOCK_FULL") {
    throw DomainErrors.illegalStateTransition(state, "IN_STOCK_EMPTY");
  }
  assertCylinderTransition(state, "IN_STOCK_EMPTY");
}

/** Loss/broken may be reported from stock or while at a client (W12). */
export function assertCanReportLoss(
  state: CylinderState,
  outcome: "LOST" | "BROKEN",
): void {
  if (isTerminalCylinderState(state)) {
    throw DomainErrors.alreadyTerminal(state);
  }
  assertCylinderTransition(state, outcome);
}

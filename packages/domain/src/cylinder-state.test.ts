import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertDeliverable,
  DELIVERABLE_STATES,
  isTerminalCylinderState,
  stateAfterDelivery,
  stateAfterReturn,
} from "./cylinder-state";
import { DomainError } from "./errors";
import { assertKindBasisConsistency, movementKindForBasis } from "./ownership";

describe("assertDeliverable", () => {
  for (const state of DELIVERABLE_STATES) {
    it(`allows ${state}`, () => {
      assert.doesNotThrow(() => assertDeliverable(state));
    });
  }

  it("rejects AT_CLIENT for rental", () => {
    assert.throws(
      () => assertDeliverable("AT_CLIENT"),
      (err: unknown) => {
        return (
          err instanceof DomainError && err.code === "ILLEGAL_STATE_TRANSITION"
        );
      },
    );
  });

  it("allows AT_CLIENT for refill cycles", () => {
    assert.doesNotThrow(() =>
      assertDeliverable("AT_CLIENT", { forRefill: true }),
    );
  });

  it("rejects terminal SOLD", () => {
    assert.throws(
      () => assertDeliverable("SOLD"),
      (err: unknown) => {
        return err instanceof DomainError && err.code === "CYLINDER_TERMINAL";
      },
    );
    assert.throws(
      () => assertDeliverable("SOLD", { forRefill: true }),
      (err: unknown) =>
        err instanceof DomainError && err.code === "CYLINDER_TERMINAL",
    );
  });
});

describe("delivery state helpers", () => {
  it("delivery lands AT_CLIENT; return lands IN_STOCK_EMPTY", () => {
    assert.equal(stateAfterDelivery(), "AT_CLIENT");
    assert.equal(stateAfterReturn(), "IN_STOCK_EMPTY");
  });

  it("marks terminal states", () => {
    assert.equal(isTerminalCylinderState("LOST"), true);
    assert.equal(isTerminalCylinderState("IN_STOCK_FULL"), false);
  });
});

describe("movement kind ↔ ownership (BR-08)", () => {
  it("RENTAL only for OURS/SUPPLIER; REFILL only for CUSTOMER", () => {
    assert.doesNotThrow(() => assertKindBasisConsistency("RENTAL", "OURS"));
    assert.doesNotThrow(() => assertKindBasisConsistency("RENTAL", "SUPPLIER"));
    assert.doesNotThrow(() => assertKindBasisConsistency("REFILL", "CUSTOMER"));
    assert.throws(() => assertKindBasisConsistency("REFILL", "OURS"));
    assert.throws(() => assertKindBasisConsistency("RENTAL", "CUSTOMER"));
  });

  it("infers kind from basis", () => {
    assert.equal(movementKindForBasis("CUSTOMER"), "REFILL");
    assert.equal(movementKindForBasis("OURS"), "RENTAL");
  });
});

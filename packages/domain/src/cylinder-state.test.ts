import assert from "node:assert/strict";
import {
  assertCanEditCylinderData,
  assertCanEmpty,
  assertCanFill,
  assertDeliverable,
  assertSellable,
  DELIVERABLE_STATES,
  SELLABLE_STATES,
  isCylinderDataEditable,
  isTerminalCylinderState,
  stateAfterDelivery,
  stateAfterEmpty,
  stateAfterFill,
  stateAfterReturn,
  stateAfterSale,
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

describe("assertSellable", () => {
  for (const state of SELLABLE_STATES) {
    it(`allows ${state}`, () => {
      assert.doesNotThrow(() => assertSellable(state));
    });
  }

  it("rejects AT_CLIENT (must sell from stock)", () => {
    assert.throws(
      () => assertSellable("AT_CLIENT"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "ILLEGAL_STATE_TRANSITION",
    );
  });

  it("rejects terminal SOLD", () => {
    assert.throws(
      () => assertSellable("SOLD"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "CYLINDER_TERMINAL",
    );
  });

  it("sale lands in terminal SOLD", () => {
    assert.equal(stateAfterSale(), "SOLD");
  });
});

describe("delivery state helpers", () => {
  it("delivery lands AT_CLIENT; return lands IN_STOCK_EMPTY", () => {
    assert.equal(stateAfterDelivery(), "AT_CLIENT");
    assert.equal(stateAfterReturn(), "IN_STOCK_EMPTY");
  });

  it("fill lands IN_STOCK_FULL", () => {
    assert.equal(stateAfterFill(), "IN_STOCK_FULL");
  });

  it("empty lands IN_STOCK_EMPTY", () => {
    assert.equal(stateAfterEmpty(), "IN_STOCK_EMPTY");
  });

  it("marks terminal states", () => {
    assert.equal(isTerminalCylinderState("LOST"), true);
    assert.equal(isTerminalCylinderState("IN_STOCK_FULL"), false);
  });
});

describe("assertCanEditCylinderData", () => {
  it("allows plant and supplier custody", () => {
    assert.equal(isCylinderDataEditable("IN_STOCK_EMPTY"), true);
    assert.equal(isCylinderDataEditable("IN_STOCK_FULL"), true);
    assert.equal(isCylinderDataEditable("AT_SUPPLIER"), true);
    assert.doesNotThrow(() => assertCanEditCylinderData("IN_STOCK_FULL"));
  });

  it("rejects while held by a client", () => {
    assert.equal(isCylinderDataEditable("AT_CLIENT"), false);
    assert.throws(
      () => assertCanEditCylinderData("AT_CLIENT"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "CYLINDER_HELD_BY_CLIENT",
    );
  });
});

describe("assertCanFill", () => {
  it("allows IN_STOCK_EMPTY", () => {
    assert.doesNotThrow(() => assertCanFill("IN_STOCK_EMPTY"));
  });

  it("rejects already full or out-of-stock states", () => {
    assert.throws(
      () => assertCanFill("IN_STOCK_FULL"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "ILLEGAL_STATE_TRANSITION",
    );
    assert.throws(
      () => assertCanFill("AT_CLIENT"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "ILLEGAL_STATE_TRANSITION",
    );
  });

  it("rejects terminal", () => {
    assert.throws(
      () => assertCanFill("SOLD"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "ALREADY_TERMINAL",
    );
  });
});

describe("assertCanEmpty", () => {
  it("allows IN_STOCK_FULL", () => {
    assert.doesNotThrow(() => assertCanEmpty("IN_STOCK_FULL"));
  });

  it("rejects already empty or out-of-stock states", () => {
    assert.throws(
      () => assertCanEmpty("IN_STOCK_EMPTY"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "ILLEGAL_STATE_TRANSITION",
    );
    assert.throws(
      () => assertCanEmpty("AT_CLIENT"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "ILLEGAL_STATE_TRANSITION",
    );
  });

  it("rejects terminal", () => {
    assert.throws(
      () => assertCanEmpty("SOLD"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "ALREADY_TERMINAL",
    );
  });
});

describe("movement kind ↔ ownership (BR-08)", () => {
  it("RENTAL only for OURS/SUPPLIER; REFILL only for CUSTOMER; SALE only for OURS", () => {
    assert.doesNotThrow(() => assertKindBasisConsistency("RENTAL", "OURS"));
    assert.doesNotThrow(() => assertKindBasisConsistency("RENTAL", "SUPPLIER"));
    assert.doesNotThrow(() => assertKindBasisConsistency("REFILL", "CUSTOMER"));
    assert.doesNotThrow(() => assertKindBasisConsistency("SALE", "OURS"));
    assert.throws(() => assertKindBasisConsistency("REFILL", "OURS"));
    assert.throws(() => assertKindBasisConsistency("RENTAL", "CUSTOMER"));
    assert.throws(() => assertKindBasisConsistency("SALE", "SUPPLIER"));
    assert.throws(() => assertKindBasisConsistency("SALE", "CUSTOMER"));
  });

  it("infers kind from basis", () => {
    assert.equal(movementKindForBasis("CUSTOMER"), "REFILL");
    assert.equal(movementKindForBasis("OURS"), "RENTAL");
  });
});

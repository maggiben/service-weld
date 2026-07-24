import assert from "node:assert/strict";
import {
  canCancelRemito,
  primaryNextAction,
  remitoStatusChipColor,
  targetStatusForAction,
} from "./remitoLogic";

describe("remitoLogic", () => {
  it("maps primary next actions along the happy path", () => {
    assert.equal(primaryNextAction("DRAFT", "DELIVERY"), "prepare");
    assert.equal(primaryNextAction("PREPARED", "DELIVERY"), "assign");
    assert.equal(primaryNextAction("SIGNED", "DELIVERY"), "close");
    assert.equal(primaryNextAction("CLOSED", "DELIVERY"), null);
  });

  it("skips fleet for customer pickup", () => {
    assert.equal(primaryNextAction("PREPARED", "CUSTOMER_PICKUP"), "deliver");
  });

  it("exposes cancel eligibility", () => {
    assert.equal(canCancelRemito("DRAFT"), true);
    assert.equal(canCancelRemito("IN_TRANSIT"), true);
    assert.equal(canCancelRemito("CLOSED"), false);
  });

  it("maps action targets and chip colors", () => {
    assert.equal(targetStatusForAction("prepare"), "PREPARED");
    assert.equal(remitoStatusChipColor("CANCELLED"), "error");
    assert.equal(remitoStatusChipColor("CLOSED"), "success");
  });
});

import assert from "node:assert/strict";
import {
  canCancelRemito,
  canSoftDeleteRemito,
  previewNextRemitoNumber,
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

  it("exposes soft-delete eligibility", () => {
    assert.equal(canSoftDeleteRemito("DRAFT"), true);
    assert.equal(canSoftDeleteRemito("CLOSED"), true);
    assert.equal(canSoftDeleteRemito("CANCELLED"), true);
    assert.equal(canSoftDeleteRemito("INVOICED"), false);
    assert.equal(canSoftDeleteRemito("ARCHIVED"), false);
  });

  it("maps action targets and chip colors", () => {
    assert.equal(targetStatusForAction("prepare"), "PREPARED");
    assert.equal(remitoStatusChipColor("CANCELLED"), "error");
    assert.equal(remitoStatusChipColor("CLOSED"), "success");
  });

  it("previews the next series number with padding", () => {
    assert.equal(
      previewNextRemitoNumber([
        {
          id: 1,
          code: "A",
          emission_point_label: "Central",
          pad_width: 8,
          next_number: 42,
          is_active: true,
        },
      ]),
      "A-00000042",
    );
    assert.equal(previewNextRemitoNumber([]), null);
    assert.equal(previewNextRemitoNumber(undefined), null);
  });
});

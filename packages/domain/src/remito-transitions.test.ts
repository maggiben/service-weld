import assert from "node:assert/strict";
import { DomainError } from "./errors";
import {
  allowedRemitoTransitions,
  assertRemitoEditable,
  assertRemitoSoftDeletable,
  assertRemitoTransition,
  formatRemitoSeriesNumber,
  isDeliveryLikeRemitoType,
  isReturnLikeRemitoType,
  paperKindForRemitoType,
  remitoPostsAccessoryRentalOnClose,
  remitoPostsCylinderCustodyOnClose,
  remitoTypeForPaperKind,
} from "./remito-transitions";

describe("paperKindForRemitoType", () => {
  it("maps return-like types to RETURN", () => {
    assert.equal(paperKindForRemitoType("CYLINDER_RETURN"), "RETURN");
    assert.equal(paperKindForRemitoType("RENTAL_PICKUP"), "RETURN");
    assert.equal(paperKindForRemitoType("DELIVERY"), "DELIVERY");
    assert.equal(paperKindForRemitoType("RENTAL_DELIVERY"), "DELIVERY");
  });

  it("maps legacy kind to type", () => {
    assert.equal(remitoTypeForPaperKind("RETURN"), "CYLINDER_RETURN");
    assert.equal(remitoTypeForPaperKind("DELIVERY"), "DELIVERY");
  });

  it("formats series numbers with zero padding", () => {
    assert.equal(formatRemitoSeriesNumber("A", 1, 8), "A-00000001");
    assert.equal(formatRemitoSeriesNumber("A", 42, 4), "A-0042");
  });
});

describe("assertRemitoTransition", () => {
  it("allows DRAFT → PREPARED", () => {
    assert.doesNotThrow(() =>
      assertRemitoTransition("DRAFT", "PREPARED", {
        remitoType: "DELIVERY",
      }),
    );
  });

  it("rejects DRAFT → DELIVERED", () => {
    assert.throws(
      () =>
        assertRemitoTransition("DRAFT", "DELIVERED", {
          remitoType: "DELIVERY",
        }),
      (err: unknown) =>
        err instanceof DomainError && err.code === "ILLEGAL_STATE_TRANSITION",
    );
  });

  it("requires schedule for ASSIGNED", () => {
    assert.throws(
      () =>
        assertRemitoTransition("PREPARED", "ASSIGNED", {
          remitoType: "DELIVERY",
          hasScheduledDeliveryAt: false,
        }),
      (err: unknown) =>
        err instanceof DomainError &&
        err.code === "REMITO_ASSIGN_REQUIRES_SCHEDULE",
    );
  });

  it("requires cancel reason", () => {
    assert.throws(
      () =>
        assertRemitoTransition("DRAFT", "CANCELLED", {
          remitoType: "DELIVERY",
          cancelReason: "  ",
        }),
      (err: unknown) =>
        err instanceof DomainError && err.code === "CANCEL_REASON_REQUIRED",
    );
  });

  it("allows customer pickup PREPARED → DELIVERED", () => {
    assert.ok(
      allowedRemitoTransitions("PREPARED", "CUSTOMER_PICKUP").includes(
        "DELIVERED",
      ),
    );
    assert.doesNotThrow(() =>
      assertRemitoTransition("PREPARED", "DELIVERED", {
        remitoType: "CUSTOMER_PICKUP",
      }),
    );
  });

  it("blocks header edit after prepare", () => {
    assert.throws(
      () => assertRemitoEditable("PREPARED"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "REMITO_NOT_EDITABLE",
    );
  });

  it("allows soft-delete except INVOICED and ARCHIVED", () => {
    assert.doesNotThrow(() => assertRemitoSoftDeletable("DRAFT"));
    assert.doesNotThrow(() => assertRemitoSoftDeletable("CLOSED"));
    assert.doesNotThrow(() => assertRemitoSoftDeletable("CANCELLED"));
    assert.throws(
      () => assertRemitoSoftDeletable("INVOICED"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "REMITO_NOT_DELETABLE",
    );
    assert.throws(
      () => assertRemitoSoftDeletable("ARCHIVED"),
      (err: unknown) =>
        err instanceof DomainError && err.code === "REMITO_NOT_DELETABLE",
    );
  });
});

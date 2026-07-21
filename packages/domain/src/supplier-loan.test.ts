import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "./errors";
import {
  assertLoanDateOrder,
  assertLoanStageAdvance,
  isLoanOverdue,
  nextLoanStage,
} from "./supplier-loan";

test("loan stages advance forward-only", () => {
  assert.equal(nextLoanStage("RECEIVED"), "OUT_TO_CLIENT");
  assert.equal(nextLoanStage("RETURNED_TO_SUPPLIER"), null);
  assert.throws(
    () => assertLoanStageAdvance("RECEIVED", "BACK_FROM_CLIENT"),
    (e: unknown) => e instanceof DomainError && e.code === "STAGE_OUT_OF_ORDER",
  );
  assert.doesNotThrow(() =>
    assertLoanStageAdvance("RECEIVED", "OUT_TO_CLIENT"),
  );
});

test("loan dates are non-decreasing", () => {
  assert.doesNotThrow(() => assertLoanDateOrder("2022-07-13", "2022-07-13"));
  assert.doesNotThrow(() => assertLoanDateOrder("2022-07-13", "2022-09-08"));
  assert.throws(
    () => assertLoanDateOrder("2022-09-09", "2022-09-08"),
    (e: unknown) => e instanceof DomainError && e.code === "DATE_ORDER",
  );
});

test("open loop is overdue after 120 days by default", () => {
  assert.equal(
    isLoanOverdue({
      stage: "OUT_TO_CLIENT",
      receivedFromSupplier: "2022-01-01",
      asOf: "2022-05-02",
    }),
    true,
  );
  assert.equal(
    isLoanOverdue({
      stage: "RETURNED_TO_SUPPLIER",
      receivedFromSupplier: "2022-01-01",
      asOf: "2022-12-01",
    }),
    false,
  );
});

test("open loop overdue threshold is configurable", () => {
  assert.equal(
    isLoanOverdue({
      stage: "RECEIVED",
      receivedFromSupplier: "2022-01-01",
      asOf: "2022-02-01",
      overdueDays: 90,
    }),
    false,
  );
  assert.equal(
    isLoanOverdue({
      stage: "RECEIVED",
      receivedFromSupplier: "2022-01-01",
      asOf: "2022-04-02",
      overdueDays: 90,
    }),
    true,
  );
});

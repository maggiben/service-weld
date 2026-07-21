import assert from "node:assert/strict";
import { test } from "node:test";
import {
  absentHereRow,
  classifyPhysicalCountRow,
  isToVerifyNote,
} from "./reconciliation";

test("physical count: matched when in stock", () => {
  const row = classifyPhysicalCountRow({
    serial: "80086",
    system: { cylinderId: 1, state: "IN_STOCK_FULL" },
  });
  assert.equal(row.kind, "MATCHED");
});

test("physical count: present elsewhere when at client", () => {
  const row = classifyPhysicalCountRow({
    serial: "80086",
    system: { cylinderId: 1, state: "AT_CLIENT" },
  });
  assert.equal(row.kind, "PRESENT_ELSEWHERE");
  assert.equal(row.suggested_action, "TRANSFER");
});

test("physical count: unknown serial", () => {
  const row = classifyPhysicalCountRow({ serial: "X", system: null });
  assert.equal(row.kind, "UNKNOWN_SERIAL");
});

test("absent here suggests loss", () => {
  const row = absentHereRow({
    cylinderId: 2,
    serial: "99",
    state: "IN_STOCK_EMPTY",
  });
  assert.equal(row.kind, "ABSENT_HERE");
  assert.equal(row.suggested_action, "LOSS");
});

test("to-verify note detection", () => {
  assert.equal(isToVerifyNote("REVISAR N°"), true);
  assert.equal(isToVerifyNote("ok"), false);
});

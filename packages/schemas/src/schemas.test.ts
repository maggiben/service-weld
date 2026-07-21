import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidCuit, Cuit } from "./cuit";

/** Known-valid CUITs covering check-digit branches (mod 11→0, mod 10→9, normal). */
const VALID = ["20-12345678-6", "00-00000000-0", "00-00000001-9"] as const;

describe("cuit", () => {
  it("accepts valid check digits", () => {
    for (const value of VALID) {
      assert.equal(isValidCuit(value), true, value);
      assert.equal(Cuit.parse(value), value);
    }
  });

  it("rejects bad format and bad check digits", () => {
    assert.equal(isValidCuit("bad"), false);
    assert.equal(isValidCuit("20-1234567-6"), false);
    assert.equal(isValidCuit("20-12345678-0"), false);
    assert.equal(isValidCuit("00-00000000-1"), false);
    assert.throws(() => Cuit.parse("11-11111111-1"));
    assert.throws(() => Cuit.parse("not-a-cuit"));
  });
});

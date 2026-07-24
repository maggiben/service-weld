import { createHash, randomBytes } from "node:crypto";
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKeyFromEnv,
  safeEqualUtf8,
} from "./secret-crypto";

describe("secret-crypto", () => {
  const material = parseEncryptionKeyFromEnv(
    randomBytes(32).toString("base64"),
  );

  it("round-trips plaintext", () => {
    const envelope = encryptSecret("private-key-pem", material);
    expect(envelope.startsWith("v1:")).toBe(true);
    expect(decryptSecret(envelope, () => material)).toBe("private-key-pem");
  });

  it("rejects missing keys", () => {
    expect(() => parseEncryptionKeyFromEnv(undefined)).toThrow();
    expect(() => parseEncryptionKeyFromEnv("not-base64-32")).toThrow();
  });

  it("compares utf8 safely", () => {
    const digest = createHash("sha256").update("x").digest("hex");
    expect(safeEqualUtf8(digest, digest)).toBe(true);
    expect(safeEqualUtf8(digest, "nope")).toBe(false);
  });
});

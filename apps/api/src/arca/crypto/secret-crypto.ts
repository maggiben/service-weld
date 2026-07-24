import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { DomainErrors } from "@weld/domain";

/**
 * AES-256-GCM secret envelope (docs/specs/arca-integration.md §13).
 * Format: `v1:<keyId>:<iv_b64>:<tag_b64>:<ciphertext_b64>`
 */

const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12; // 96-bit IV for GCM
const KEY_BYTES = 32;

export interface ArcaCryptoKeyMaterial {
  /** Logical key id for rotation (R-55). */
  keyId: string;
  /** 32-byte AES key. */
  key: Buffer;
}

export function parseEncryptionKeyFromEnv(
  raw: string | undefined,
  keyId = "default",
): ArcaCryptoKeyMaterial {
  if (!raw || raw.trim().length === 0) {
    throw DomainErrors.arcaEncryptionKeyMissing();
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw DomainErrors.arcaEncryptionKeyMissing();
  }
  return { keyId, key };
}

export function encryptSecret(
  plaintext: string,
  material: ArcaCryptoKeyMaterial,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", material.key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    material.keyId,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(
  envelope: string,
  resolveKey: (keyId: string) => ArcaCryptoKeyMaterial,
): string {
  const parts = envelope.split(":");
  if (parts.length !== 5 || parts[0] !== ENVELOPE_VERSION) {
    throw DomainErrors.arcaEncryptionKeyMissing();
  }
  const keyId = parts[1]!;
  const iv = Buffer.from(parts[2]!, "base64");
  const tag = Buffer.from(parts[3]!, "base64");
  const ciphertext = Buffer.from(parts[4]!, "base64");
  const material = resolveKey(keyId);
  const decipher = createDecipheriv("aes-256-gcm", material.key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Constant-time string compare for fingerprints / digests. */
export function safeEqualUtf8(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left, "utf8");
  const rightBuf = Buffer.from(right, "utf8");
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

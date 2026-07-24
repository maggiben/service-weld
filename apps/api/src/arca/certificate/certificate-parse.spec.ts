import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  webcrypto,
} from "node:crypto";
import * as x509 from "@peculiar/x509";
import {
  assertCertificateUploadSize,
  normalizeCertificatePem,
  parseCertificateToFacts,
  runCertificateValidation,
} from "./certificate-parse";

x509.cryptoProvider.set(webcrypto as never);

interface TestKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

function generateRsaKeyPair(): TestKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

async function toCryptoKeyPair(pair: TestKeyPair) {
  const privateKey = await webcrypto.subtle.importKey(
    "pkcs8",
    createPrivateKey(pair.privateKeyPem).export({
      type: "pkcs8",
      format: "der",
    }),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const publicKey = await webcrypto.subtle.importKey(
    "spki",
    createPublicKey(pair.publicKeyPem).export({
      type: "spki",
      format: "der",
    }),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["verify"],
  );
  return { privateKey, publicKey };
}

async function generateSelfSignedCertPem(input: {
  cuitDigits: string;
  keyPair: TestKeyPair;
  notBefore?: Date;
  notAfter?: Date;
}): Promise<string> {
  const keys = await toCryptoKeyPair(input.keyPair);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: `CN=Weld Test, O=Weld, 2.5.4.5=CUIT ${input.cuitDigits}`,
    notBefore: input.notBefore ?? new Date("2020-01-01T00:00:00Z"),
    notAfter: input.notAfter ?? new Date("2035-01-01T00:00:00Z"),
    signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    keys,
  });
  return cert.toString("pem");
}

describe("certificate-parse", () => {
  const cuitDigits = "20304050607";
  let keyPair: TestKeyPair;
  let otherKeyPair: TestKeyPair;
  let certPem: string;

  beforeAll(async () => {
    keyPair = generateRsaKeyPair();
    otherKeyPair = generateRsaKeyPair();
    certPem = await generateSelfSignedCertPem({ cuitDigits, keyPair });
  });

  describe("assertCertificateUploadSize", () => {
    it("throws ARCA_CERTIFICATE_TOO_LARGE for empty files", () => {
      expect(() => assertCertificateUploadSize(0)).toThrow(
        expect.objectContaining({ code: "ARCA_CERTIFICATE_TOO_LARGE" }),
      );
    });

    it("throws ARCA_CERTIFICATE_TOO_LARGE above 100 KB", () => {
      expect(() => assertCertificateUploadSize(100 * 1024 + 1)).toThrow(
        expect.objectContaining({ code: "ARCA_CERTIFICATE_TOO_LARGE" }),
      );
    });

    it("accepts sizes within the 100 KB limit", () => {
      expect(() => assertCertificateUploadSize(1024)).not.toThrow();
      expect(() => assertCertificateUploadSize(100 * 1024)).not.toThrow();
    });
  });

  describe("normalizeCertificatePem", () => {
    it("preserves an already-PEM string with a trailing newline", () => {
      const withNewline = `${certPem.trim()}\n`;
      expect(normalizeCertificatePem(withNewline)).toBe(withNewline);
    });

    it("adds a trailing newline when missing", () => {
      const withoutNewline = certPem.trim();
      const normalized = normalizeCertificatePem(withoutNewline);
      expect(normalized.endsWith("\n")).toBe(true);
      expect(normalized).toBe(`${withoutNewline}\n`);
    });

    it("wraps bare base64 into a PEM envelope", () => {
      const body = certPem
        .replace("-----BEGIN CERTIFICATE-----", "")
        .replace("-----END CERTIFICATE-----", "")
        .trim();
      const normalized = normalizeCertificatePem(body);
      expect(normalized.startsWith("-----BEGIN CERTIFICATE-----\n")).toBe(true);
      expect(normalized.trim().endsWith("-----END CERTIFICATE-----")).toBe(
        true,
      );
    });

    it("accepts Buffer input", () => {
      const buffer = Buffer.from(certPem, "utf8");
      const normalized = normalizeCertificatePem(buffer);
      expect(normalized.includes("BEGIN CERTIFICATE")).toBe(true);
    });
  });

  describe("parseCertificateToFacts", () => {
    it("parses successfully and matches the corresponding private key", () => {
      const facts = parseCertificateToFacts(certPem, keyPair.privateKeyPem);
      expect(facts.parsedOk).toBe(true);
      expect(facts.pemOk).toBe(true);
      expect(facts.privateKeyMatches).toBe(true);
      expect(facts.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(facts.subject).toContain(cuitDigits);
    });

    it("reports privateKeyMatches false for a mismatched key", () => {
      const facts = parseCertificateToFacts(
        certPem,
        otherKeyPair.privateKeyPem,
      );
      expect(facts.parsedOk).toBe(true);
      expect(facts.privateKeyMatches).toBe(false);
    });

    it("reports privateKeyMatches false when no key is supplied", () => {
      const facts = parseCertificateToFacts(certPem, null);
      expect(facts.parsedOk).toBe(true);
      expect(facts.privateKeyMatches).toBe(false);
    });

    it("marks parsedOk false for garbage input", () => {
      const facts = parseCertificateToFacts("not a certificate", null);
      expect(facts.parsedOk).toBe(false);
      expect(facts.pemOk).toBe(false);
    });

    it("still flags pemOk for garbage that mentions BEGIN CERTIFICATE", () => {
      const facts = parseCertificateToFacts(
        "-----BEGIN CERTIFICATE-----\nnot-really-base64\n",
        null,
      );
      expect(facts.parsedOk).toBe(false);
      expect(facts.pemOk).toBe(true);
    });
  });

  describe("runCertificateValidation", () => {
    it("returns an ordered checks array with an overall ok flag", () => {
      const { checks, ok, facts } = runCertificateValidation({
        certPem,
        privateKeyPem: keyPair.privateKeyPem,
        cuit: "20-30405060-7",
        environment: "HOMOLOGATION",
      });
      expect(checks.length).toBeGreaterThan(0);
      expect(checks.map((item) => item.id)).toEqual([
        "VALID_X509",
        "CORRECT_PEM",
        "NOT_EXPIRED",
        "PRIVATE_KEY_MATCH",
        "CUIT_MATCH",
        "ENVIRONMENT_MATCH",
      ]);
      expect(facts.parsedOk).toBe(true);
      expect(typeof ok).toBe("boolean");
    });

    it("fails validation for an unparseable certificate", () => {
      const { ok, checks } = runCertificateValidation({
        certPem: "garbage",
        privateKeyPem: null,
        cuit: "20-30405060-7",
        environment: "HOMOLOGATION",
      });
      expect(ok).toBe(false);
      expect(checks.find((item) => item.id === "VALID_X509")?.passed).toBe(
        false,
      );
    });
  });
});

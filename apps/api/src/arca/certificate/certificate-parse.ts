import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
  createHash,
} from "node:crypto";
import type { ArcaEnvironment } from "@weld/schemas";
import {
  type ParsedCertificateFacts,
  validateArcaCertificate,
  allValidationChecksPassed,
} from "@weld/domain";
import type { ArcaValidationCheck } from "@weld/schemas";

const MAX_CERT_BYTES = 100 * 1024;

export function assertCertificateUploadSize(bytes: number): void {
  if (bytes <= 0 || bytes > MAX_CERT_BYTES) {
    throw Object.assign(new Error("Certificate file must be at most 100 KB."), {
      code: "ARCA_CERTIFICATE_TOO_LARGE",
    });
  }
}

export function normalizeCertificatePem(raw: string | Buffer): string {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  const trimmed = text.trim();
  if (trimmed.includes("BEGIN CERTIFICATE")) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }
  // Bare base64 / DER uploaded as text — wrap as PEM.
  const body = trimmed.replaceAll(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

export function parseCertificateToFacts(
  certPem: string,
  privateKeyPem: string | null,
): ParsedCertificateFacts {
  let parsedOk = false;
  let pemOk = false;
  let subject = "";
  let issuer = "";
  let notBefore = new Date(0);
  let notAfter = new Date(0);
  let fingerprintSha256: string | null = null;
  let privateKeyMatches = false;

  try {
    pemOk =
      certPem.includes("BEGIN CERTIFICATE") &&
      certPem.includes("END CERTIFICATE");
    const cert = new X509Certificate(certPem);
    parsedOk = true;
    subject = cert.subject;
    issuer = cert.issuer;
    notBefore = new Date(cert.validFrom);
    notAfter = new Date(cert.validTo);
    fingerprintSha256 = createHash("sha256").update(cert.raw).digest("hex");

    if (privateKeyPem) {
      // cert.publicKey is already a public KeyObject — export it directly
      // rather than round-tripping through createPublicKey(), which some
      // Node versions reject for KeyObjects that are already public.
      const fromCert = cert.publicKey.export({
        type: "spki",
        format: "der",
      }) as Buffer;
      const fromKey = createPublicKey(createPrivateKey(privateKeyPem)).export({
        type: "spki",
        format: "der",
      }) as Buffer;
      privateKeyMatches =
        fromCert.length === fromKey.length && fromCert.equals(fromKey);
    }
  } catch {
    parsedOk = false;
    pemOk = certPem.includes("BEGIN CERTIFICATE");
  }

  return {
    subject,
    issuer,
    notBefore,
    notAfter,
    parsedOk,
    pemOk,
    privateKeyMatches,
    fingerprintSha256,
  };
}

export function runCertificateValidation(input: {
  certPem: string;
  privateKeyPem: string | null;
  cuit: string;
  environment: ArcaEnvironment;
  now?: Date;
}): {
  checks: ArcaValidationCheck[];
  ok: boolean;
  facts: ParsedCertificateFacts;
} {
  const facts = parseCertificateToFacts(input.certPem, input.privateKeyPem);
  const checks = validateArcaCertificate(facts, {
    cuit: input.cuit,
    environment: input.environment,
    now: input.now,
  });
  return { checks, ok: allValidationChecksPassed(checks), facts };
}

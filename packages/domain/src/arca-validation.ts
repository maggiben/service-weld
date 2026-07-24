import type { ArcaEnvironment, ArcaValidationCheck } from "@weld/schemas";
import { cuitDigits } from "./arca-onboarding";

/** Parsed certificate facts for pure validation (R-26). */
export interface ParsedCertificateFacts {
  /** Raw subject DN string (may include SERIALNUMBER=CUIT …). */
  subject: string;
  /** Raw issuer DN string. */
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  /** True when PEM/DER parsed as X.509. */
  parsedOk: boolean;
  /** True when encoding looks like PEM/DER. */
  pemOk: boolean;
  /** True when cert public key matches stored private key. */
  privateKeyMatches: boolean;
  /** SHA-256 fingerprint (hex, lowercase, no colons) when available. */
  fingerprintSha256: string | null;
}

const HOMOLOGATION_ISSUER_HINTS = [
  "prueba",
  "test",
  "homolog",
  "testing",
  "autoridad certificante de prueba",
] as const;

const PRODUCTION_ISSUER_HINTS = [
  "autoridad certificante de firma digital",
  "afip",
  "arca",
] as const;

/**
 * Infer ARCA environment from certificate issuer (R-25 / R-28).
 * Returns null when unknown — treated as a hard fail for the environment check.
 */
export function inferEnvironmentFromIssuer(
  issuer: string,
): ArcaEnvironment | null {
  const normalized = issuer.toLowerCase();
  if (HOMOLOGATION_ISSUER_HINTS.some((hint) => normalized.includes(hint))) {
    // "afip" alone also matches production — prefer homologation when prueba/test present.
    if (
      normalized.includes("prueba") ||
      normalized.includes("test") ||
      normalized.includes("homolog") ||
      normalized.includes("testing")
    ) {
      return "HOMOLOGATION";
    }
  }
  if (
    normalized.includes("autoridad certificante de firma digital") ||
    (normalized.includes("afip") && !normalized.includes("prueba"))
  ) {
    return "PRODUCTION";
  }
  if (HOMOLOGATION_ISSUER_HINTS.some((hint) => normalized.includes(hint))) {
    return "HOMOLOGATION";
  }
  return null;
}

/**
 * Extract CUIT digits from subject DN.
 * Accepts `serialNumber=CUIT 20111111112`, `SERIALNUMBER=CUIT 20-11111111-2`, etc.
 */
export function extractCuitFromSubject(subject: string): string | null {
  const match = subject.match(
    /(?:serialNumber|SERIALNUMBER|2\.5\.4\.5)\s*=\s*(?:CUIT\s*)?([\d-]{11,13})/i,
  );
  if (!match?.[1]) return null;
  const digits = match[1].replaceAll("-", "");
  return /^\d{11}$/.test(digits) ? digits : null;
}

function check(
  id: ArcaValidationCheck["id"],
  passed: boolean,
  message: string,
): ArcaValidationCheck {
  return { id, passed, message };
}

/**
 * Run ordered validation checks (R-25). Pure — no I/O.
 */
export function validateArcaCertificate(
  facts: ParsedCertificateFacts,
  expected: {
    cuit: string;
    environment: ArcaEnvironment;
    now?: Date;
  },
): ArcaValidationCheck[] {
  const now = expected.now ?? new Date();
  const checks: ArcaValidationCheck[] = [];

  checks.push(
    check(
      "VALID_X509",
      facts.parsedOk,
      facts.parsedOk
        ? "Certificate is readable."
        : "The certificate cannot be read.",
    ),
  );

  checks.push(
    check(
      "CORRECT_PEM",
      facts.pemOk,
      facts.pemOk
        ? "Certificate format is valid."
        : "Invalid certificate format.",
    ),
  );

  const notExpired =
    facts.parsedOk &&
    facts.notBefore.getTime() <= now.getTime() &&
    facts.notAfter.getTime() > now.getTime();
  checks.push(
    check(
      "NOT_EXPIRED",
      notExpired,
      notExpired
        ? "Certificate is within its validity period."
        : "This certificate has expired.",
    ),
  );

  checks.push(
    check(
      "PRIVATE_KEY_MATCH",
      facts.privateKeyMatches,
      facts.privateKeyMatches
        ? "Certificate matches the generated key."
        : "This certificate does not match the generated key. Please generate a new Access Request.",
    ),
  );

  const subjectCuit = facts.parsedOk
    ? extractCuitFromSubject(facts.subject)
    : null;
  const expectedDigits = cuitDigits(expected.cuit);
  const cuitMatch = subjectCuit != null && subjectCuit === expectedDigits;
  checks.push(
    check(
      "CUIT_MATCH",
      cuitMatch,
      cuitMatch
        ? "Certificate belongs to the configured CUIT."
        : "This certificate belongs to a different CUIT.",
    ),
  );

  const inferred = facts.parsedOk
    ? inferEnvironmentFromIssuer(facts.issuer)
    : null;
  const environmentMatch = inferred === expected.environment;
  let envMessage = "Certificate matches the selected environment.";
  if (!environmentMatch) {
    if (inferred == null) {
      envMessage =
        "Could not determine whether this is a Testing or Live certificate.";
    } else if (expected.environment === "HOMOLOGATION") {
      envMessage = "This is a Live certificate but you selected Testing.";
    } else {
      envMessage = "This is a Testing certificate but you selected Live.";
    }
  }
  checks.push(check("ENVIRONMENT_MATCH", environmentMatch, envMessage));

  return checks;
}

export function allValidationChecksPassed(
  checks: readonly ArcaValidationCheck[],
): boolean {
  return checks.every((item) => item.passed);
}

import assert from "node:assert/strict";
import {
  assertArcaActionAllowed,
  arcaSdkProductionFlag,
  ARCA_SIMULATION_FINGERPRINT,
  buildSimulatedArcaCae,
  cuitDigits,
  deriveArcaStatus,
  deriveArcaStatusChecks,
  effectiveArcaEnvironment,
  simulatedArcaCredentialFacts,
} from "./arca-onboarding";
import { DomainError } from "./errors";
import {
  allValidationChecksPassed,
  extractCuitFromSubject,
  inferEnvironmentFromIssuer,
  validateArcaCertificate,
} from "./arca-validation";

describe("deriveArcaStatus", () => {
  it("starts NOT_STARTED without a key", () => {
    assert.equal(
      deriveArcaStatus({
        hasPrivateKey: false,
        hasCsr: false,
        hasCertificate: false,
        isValidated: false,
        validUntil: null,
        lastAuthentication: null,
        connectionStatus: "NOT_CONFIGURED",
      }),
      "NOT_STARTED",
    );
  });

  it("reaches KEY_READY after key+csr", () => {
    assert.equal(
      deriveArcaStatus({
        hasPrivateKey: true,
        hasCsr: true,
        hasCertificate: false,
        isValidated: false,
        validUntil: null,
        lastAuthentication: null,
        connectionStatus: "NOT_CONFIGURED",
      }),
      "KEY_READY",
    );
  });

  it("marks EXPIRED when validUntil elapsed", () => {
    assert.equal(
      deriveArcaStatus({
        hasPrivateKey: true,
        hasCsr: true,
        hasCertificate: true,
        isValidated: true,
        validUntil: new Date("2020-01-01T00:00:00Z"),
        lastAuthentication: new Date("2020-01-02T00:00:00Z"),
        connectionStatus: "CONNECTED",
        now: new Date("2024-01-01T00:00:00Z"),
      }),
      "EXPIRED",
    );
  });

  it("reaches CONNECTED when validated and authenticated", () => {
    assert.equal(
      deriveArcaStatus({
        hasPrivateKey: true,
        hasCsr: true,
        hasCertificate: true,
        isValidated: true,
        validUntil: new Date("2030-01-01T00:00:00Z"),
        lastAuthentication: new Date("2024-06-01T00:00:00Z"),
        connectionStatus: "CONNECTED",
        now: new Date("2024-07-01T00:00:00Z"),
      }),
      "CONNECTED",
    );
  });
});

describe("assertArcaActionAllowed", () => {
  it("blocks generate without CUIT", () => {
    assert.throws(
      () =>
        assertArcaActionAllowed("NOT_STARTED", "generate_keys", {
          hasCompanyCuit: false,
        }),
      (error: unknown) =>
        error instanceof DomainError && error.code === "ARCA_CUIT_REQUIRED",
    );
  });

  it("requires confirm to regenerate over a certificate", () => {
    assert.throws(
      () =>
        assertArcaActionAllowed("VALIDATED", "generate_keys", {
          hasCompanyCuit: true,
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === "ARCA_REGENERATE_REQUIRES_CONFIRM",
    );
  });

  it("allows upload after KEY_READY", () => {
    assert.doesNotThrow(() =>
      assertArcaActionAllowed("KEY_READY", "upload_certificate"),
    );
  });
});

describe("environment helpers", () => {
  it("maps production flag and testing mode", () => {
    assert.equal(arcaSdkProductionFlag("PRODUCTION"), true);
    assert.equal(arcaSdkProductionFlag("HOMOLOGATION"), false);
    assert.equal(effectiveArcaEnvironment("PRODUCTION", true), "HOMOLOGATION");
    assert.equal(effectiveArcaEnvironment("PRODUCTION", false), "PRODUCTION");
  });

  it("builds simulated CONNECTED facts and CAE", () => {
    const now = new Date("2026-07-24T12:00:00.000Z");
    const facts = simulatedArcaCredentialFacts(now);
    assert.equal(deriveArcaStatus(facts), "CONNECTED");
    assert.equal(facts.connectionStatus, "CONNECTED");
    const cae = buildSimulatedArcaCae(now);
    assert.equal(cae.caeFchVto, "20260803");
    assert.equal(cae.cbteNro, 1);
    assert.equal(ARCA_SIMULATION_FINGERPRINT, "SIMULATION");
  });

  it("normalizes CUIT digits", () => {
    assert.equal(cuitDigits("20-12345678-6"), "20123456786");
  });
});

describe("status checks", () => {
  it("mirrors facts", () => {
    assert.deepEqual(
      deriveArcaStatusChecks({
        hasPrivateKey: true,
        hasCsr: true,
        hasCertificate: false,
        isValidated: false,
        validUntil: null,
        lastAuthentication: null,
        connectionStatus: "NOT_CONFIGURED",
      }),
      {
        has_private_key: true,
        has_csr: true,
        has_certificate: false,
        is_validated: false,
      },
    );
  });
});

describe("certificate validation", () => {
  it("extracts CUIT from subject", () => {
    assert.equal(
      extractCuitFromSubject("CN=foo, SERIALNUMBER=CUIT 20123456786, O=bar"),
      "20123456786",
    );
    assert.equal(
      extractCuitFromSubject("serialNumber=CUIT 20-12345678-6"),
      "20123456786",
    );
  });

  it("infers environment from issuer", () => {
    assert.equal(
      inferEnvironmentFromIssuer("CN=Autoridad Certificante de Prueba - AFIP"),
      "HOMOLOGATION",
    );
    assert.equal(
      inferEnvironmentFromIssuer(
        "CN=Autoridad Certificante de Firma Digital - AFIP",
      ),
      "PRODUCTION",
    );
  });

  it("fails all critical checks on empty parse", () => {
    const checks = validateArcaCertificate(
      {
        subject: "",
        issuer: "",
        notBefore: new Date(0),
        notAfter: new Date(0),
        parsedOk: false,
        pemOk: false,
        privateKeyMatches: false,
        fingerprintSha256: null,
      },
      {
        cuit: "20-12345678-6",
        environment: "HOMOLOGATION",
        now: new Date("2024-01-01T00:00:00Z"),
      },
    );
    assert.equal(allValidationChecksPassed(checks), false);
    assert.equal(
      checks.find((item) => item.id === "VALID_X509")?.passed,
      false,
    );
  });

  it("passes when facts align", () => {
    const checks = validateArcaCertificate(
      {
        subject: "CN=x, SERIALNUMBER=CUIT 20123456786, O=y",
        issuer: "CN=Autoridad Certificante de Prueba - AFIP",
        notBefore: new Date("2023-01-01T00:00:00Z"),
        notAfter: new Date("2030-01-01T00:00:00Z"),
        parsedOk: true,
        pemOk: true,
        privateKeyMatches: true,
        fingerprintSha256: "abc",
      },
      {
        cuit: "20-12345678-6",
        environment: "HOMOLOGATION",
        now: new Date("2024-06-01T00:00:00Z"),
      },
    );
    assert.equal(allValidationChecksPassed(checks), true);
  });
});

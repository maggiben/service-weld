import type {
  ArcaConnectionStatus,
  ArcaEnvironment,
  ArcaOnboardingStatus,
  ArcaStatusChecks,
} from "@weld/schemas";
import { DomainErrors } from "./errors";

/** Facts used to derive onboarding status (docs/specs/arca-integration.md §5). */
export interface ArcaCredentialFacts {
  hasPrivateKey: boolean;
  hasCsr: boolean;
  hasCertificate: boolean;
  isValidated: boolean;
  validUntil: Date | null;
  lastAuthentication: Date | null;
  connectionStatus: ArcaConnectionStatus;
  now?: Date;
}

export function deriveArcaStatusChecks(
  facts: ArcaCredentialFacts,
): ArcaStatusChecks {
  return {
    has_private_key: facts.hasPrivateKey,
    has_csr: facts.hasCsr,
    has_certificate: facts.hasCertificate,
    is_validated: facts.isValidated,
  };
}

/**
 * Derive onboarding status from stored facts (R-6).
 * EXPIRED overrides VALIDATED/CONNECTED when validUntil ≤ now.
 */
export function deriveArcaStatus(
  facts: ArcaCredentialFacts,
): ArcaOnboardingStatus {
  const now = facts.now ?? new Date();

  if (!facts.hasPrivateKey) {
    return "NOT_STARTED";
  }

  if (
    facts.isValidated &&
    facts.validUntil != null &&
    facts.validUntil.getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }

  if (
    facts.isValidated &&
    facts.connectionStatus === "CONNECTED" &&
    facts.lastAuthentication != null
  ) {
    return "CONNECTED";
  }

  if (facts.isValidated) {
    return "VALIDATED";
  }

  if (facts.hasCertificate) {
    return "CERT_UPLOADED";
  }

  if (facts.hasCsr || facts.hasPrivateKey) {
    return "KEY_READY";
  }

  return "NOT_STARTED";
}

/** Maps environment enum → @arcasdk/core `production` flag (R-31). */
export function arcaSdkProductionFlag(environment: ArcaEnvironment): boolean {
  return environment === "PRODUCTION";
}

/**
 * Effective environment for invoicing (R-34).
 * Testing mode forces Homologation even when production credentials exist.
 */
export function effectiveArcaEnvironment(
  selected: ArcaEnvironment,
  testingMode: boolean,
): ArcaEnvironment {
  return testingMode ? "HOMOLOGATION" : selected;
}

export type ArcaAction =
  | "generate_keys"
  | "upload_certificate"
  | "validate_certificate"
  | "test_connection"
  | "delete_certificate";

/**
 * Assert the action is legal for the current status (R-7 / R-8).
 * Returns void or throws DomainError.
 */
export function assertArcaActionAllowed(
  status: ArcaOnboardingStatus,
  action: ArcaAction,
  options: {
    confirmRegenerate?: boolean;
    hasCompanyCuit?: boolean;
  } = {},
): void {
  switch (action) {
    case "generate_keys": {
      if (!options.hasCompanyCuit) {
        throw DomainErrors.arcaCuitRequired();
      }
      if (
        (status === "VALIDATED" ||
          status === "CONNECTED" ||
          status === "CERT_UPLOADED" ||
          status === "EXPIRED") &&
        !options.confirmRegenerate
      ) {
        throw DomainErrors.arcaRegenerateRequiresConfirm();
      }
      return;
    }
    case "upload_certificate": {
      if (status === "NOT_STARTED") {
        throw DomainErrors.illegalArcaTransition(status, "CERT_UPLOADED");
      }
      return;
    }
    case "validate_certificate": {
      if (
        status !== "CERT_UPLOADED" &&
        status !== "VALIDATED" &&
        status !== "CONNECTED" &&
        status !== "EXPIRED"
      ) {
        throw DomainErrors.illegalArcaTransition(status, "VALIDATED");
      }
      return;
    }
    case "test_connection": {
      if (
        status !== "VALIDATED" &&
        status !== "CONNECTED" &&
        status !== "EXPIRED"
      ) {
        throw DomainErrors.illegalArcaTransition(status, "CONNECTED");
      }
      if (status === "EXPIRED") {
        throw DomainErrors.arcaCertificateExpired();
      }
      return;
    }
    case "delete_certificate": {
      if (status === "NOT_STARTED") {
        throw DomainErrors.illegalArcaTransition(status, "NOT_STARTED");
      }
      return;
    }
    default: {
      const _exhaustive: never = action;
      throw DomainErrors.illegalArcaTransition(String(_exhaustive), "unknown");
    }
  }
}

/** Strip hyphens for ARCA DN / numeric CUIT. */
export function cuitDigits(cuit: string): string {
  return cuit.replaceAll("-", "");
}

export function cuitAsNumber(cuit: string): number {
  return Number(cuitDigits(cuit));
}

/** Marker fingerprint when ARCA simulation mode is active (no real cert). */
export const ARCA_SIMULATION_FINGERPRINT = "SIMULATION";

/**
 * Synthetic CONNECTED facts for development without WSASS / live ARCA.
 * Used by the dashboard overlay and connection-test short-circuit.
 */
export function simulatedArcaCredentialFacts(
  now: Date = new Date(),
): ArcaCredentialFacts {
  const validUntil = new Date(now);
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);
  return {
    hasPrivateKey: true,
    hasCsr: true,
    hasCertificate: true,
    isValidated: true,
    validUntil,
    lastAuthentication: now,
    connectionStatus: "CONNECTED",
    now,
  };
}

/** Fake CAE payload for simulated electronic authorization (AFIP date = YYYYMMDD). */
export function buildSimulatedArcaCae(now: Date = new Date()): {
  cae: string;
  caeFchVto: string;
  cbteNro: number;
} {
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + 10);
  const year = due.getUTCFullYear();
  const month = String(due.getUTCMonth() + 1).padStart(2, "0");
  const day = String(due.getUTCDate()).padStart(2, "0");
  return {
    cae: "74111111111114",
    caeFchVto: `${year}${month}${day}`,
    cbteNro: 1,
  };
}

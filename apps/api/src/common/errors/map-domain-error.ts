import { DomainError } from "@weld/domain";
import { ApiError, ApiErrors } from "./api-error";

/** Map domain errors onto the stable API error envelope. */
export function mapDomainError(error: unknown): never {
  if (error instanceof DomainError) {
    const status =
      error.code.startsWith("INVALID") ||
      error.code.includes("MISMATCH") ||
      error.code.includes("OUT_OF_RANGE") ||
      error.code === "RETURN_BEFORE_DELIVERY" ||
      error.code === "ILLEGAL_STATE_TRANSITION" ||
      error.code === "TOO_FEW_MEMBERS" ||
      error.code === "MEMBER_NOT_IN_STOCK" ||
      error.code === "STAGE_OUT_OF_ORDER" ||
      error.code === "DATE_ORDER" ||
      error.code === "SAME_PARTY" ||
      error.code === "CANCEL_REASON_REQUIRED" ||
      error.code === "REMITO_ASSIGN_REQUIRES_SCHEDULE" ||
      error.code === "REMITO_NOT_EDITABLE" ||
      error.code === "REMITO_NOT_DELETABLE" ||
      error.code === "ARCA_CUIT_REQUIRED" ||
      error.code === "ARCA_REGENERATE_REQUIRES_CONFIRM" ||
      error.code === "ARCA_CERTIFICATE_EXPIRED" ||
      error.code === "ARCA_GO_LIVE_REQUIRES_CONFIRM" ||
      error.code === "ARCA_GO_LIVE_REQUIRES_PRODUCTION" ||
      error.code === "ARCA_ENCRYPTION_KEY_MISSING" ||
      error.code === "ARCA_NOT_CONNECTED" ||
      error.code === "ARCA_AUTHORIZATION_FAILED" ||
      error.code === "INVOICE_NOT_APPROVED" ||
      error.code === "INVOICE_ALREADY_AUTHORIZED" ||
      error.code === "INVOICE_NOT_AUTHORIZED" ||
      error.code === "INVOICE_CANNOT_VOID_WITH_ARCA" ||
      error.code === "SIMULATION_MODE_REQUIRED" ||
      error.code === "INVOICE_NOTHING_TO_RESET"
        ? 422
        : 409;
    throw new ApiError(error.code, error.message, status);
  }
  throw error;
}

export function assertOrApi(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    mapDomainError(error);
  }
}

export { ApiErrors };

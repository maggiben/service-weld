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
      error.code === "SAME_PARTY"
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

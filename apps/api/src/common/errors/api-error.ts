export interface ApiErrorDetail {
  field: string;
  issue: string;
}

/**
 * Application error with a stable API code (openapi_specification.md §2.8 / §6).
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const ApiErrors = {
  unauthenticated(message = "Missing or invalid token"): ApiError {
    return new ApiError("UNAUTHENTICATED", message, 401);
  },

  invalidCredentials(message = "Invalid username or password"): ApiError {
    return new ApiError("INVALID_CREDENTIALS", message, 401);
  },

  invalidRefresh(message = "Invalid or revoked refresh token"): ApiError {
    return new ApiError("INVALID_REFRESH", message, 401);
  },

  forbidden(message = "Not permitted"): ApiError {
    return new ApiError("FORBIDDEN", message, 403);
  },

  mfaRequired(message = "Multi-factor authentication required"): ApiError {
    return new ApiError("MFA_REQUIRED", message, 403);
  },

  notFound(message = "Resource not found"): ApiError {
    return new ApiError("NOT_FOUND", message, 404);
  },

  validationFailed(
    message = "Validation failed",
    details: ApiErrorDetail[] = [],
  ): ApiError {
    return new ApiError("VALIDATION_FAILED", message, 422, details);
  },

  duplicateCuit(message = "A client with this CUIT already exists"): ApiError {
    return new ApiError("DUPLICATE_CUIT", message, 409);
  },

  duplicateSerial(
    message = "A cylinder with this serial already exists for the owner",
  ): ApiError {
    return new ApiError("DUPLICATE_SERIAL_FOR_OWNER", message, 409);
  },

  cylinderAlreadyOut(
    message = "Cylinder already has an open movement",
  ): ApiError {
    return new ApiError("CYLINDER_ALREADY_OUT", message, 409);
  },

  cylinderTerminal(message = "Cylinder is in a terminal state"): ApiError {
    return new ApiError("CYLINDER_TERMINAL", message, 409);
  },

  notOpen(message = "Movement is not OPEN"): ApiError {
    return new ApiError("NOT_OPEN", message, 409);
  },

  alreadyTerminal(
    message = "Cylinder is already in a terminal state",
  ): ApiError {
    return new ApiError("ALREADY_TERMINAL", message, 409);
  },

  returnedCylinderBusy(
    message = "Returned cylinder already has an open movement",
  ): ApiError {
    return new ApiError("RETURNED_CYLINDER_BUSY", message, 409);
  },

  conflict(code: string, message: string): ApiError {
    return new ApiError(code, message, 409);
  },

  tooFewMembers(message = "Battery requires at least 2 members"): ApiError {
    return new ApiError("TOO_FEW_MEMBERS", message, 422);
  },

  memberAlreadyPacked(
    message = "Cylinder is already in an active battery",
  ): ApiError {
    return new ApiError("MEMBER_ALREADY_PACKED", message, 409);
  },

  replacementNotAvailable(
    message = "Replacement cylinder is not available in stock",
  ): ApiError {
    return new ApiError("REPLACEMENT_NOT_AVAILABLE", message, 409);
  },

  duplicateUsername(
    message = "A user with this username already exists",
  ): ApiError {
    return new ApiError("DUPLICATE_USERNAME", message, 409);
  },
};

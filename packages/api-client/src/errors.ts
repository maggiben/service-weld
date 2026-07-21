import type { ErrorEnvelope } from "@weld/schemas";

export class ApiClientError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: { field: string; issue: string }[];
  readonly requestId: string;

  constructor(
    code: string,
    message: string,
    httpStatus: number,
    details: { field: string; issue: string }[] = [],
    requestId = "",
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.requestId = requestId;
  }

  static fromEnvelope(status: number, body: ErrorEnvelope): ApiClientError {
    return new ApiClientError(
      body.error.code,
      body.error.message,
      status,
      body.error.details ?? [],
      body.error.request_id,
    );
  }
}

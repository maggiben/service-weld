import type { UseFormSetError, FieldValues, Path } from "react-hook-form";
import { ApiClientError } from "@weld/api-client";

function isValidationError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.httpStatus === 422;
}

/** Maps API `422 details[]` onto react-hook-form field errors (006 R5). */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fallbackField?: Path<T>,
): boolean {
  if (!isValidationError(error)) return false;
  if (error.details.length === 0) {
    if (fallbackField) {
      setError(fallbackField, { type: "server", message: error.message });
    }
    return true;
  }
  for (const detail of error.details) {
    setError(detail.field as Path<T>, {
      type: "server",
      message: detail.issue,
    });
  }
  return true;
}

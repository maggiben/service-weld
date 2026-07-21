import type { UseFormSetError, FieldValues, Path } from "react-hook-form";
import { ApiClientError } from "@weld/api-client";

/**
 * Maps API `422 details[]` onto react-hook-form field errors (006 R5).
 */
export function applyServerErrors(
  error: unknown,
  setError: UseFormSetError<FieldValues>,
  fallbackField?: Path<FieldValues>,
): boolean {
  if (!(error instanceof ApiClientError) || error.httpStatus !== 422) {
    return false;
  }
  if (error.details.length === 0) {
    if (fallbackField) {
      setError(fallbackField, { type: "server", message: error.message });
    }
    return true;
  }
  for (const detail of error.details) {
    setError(detail.field, { type: "server", message: detail.issue });
  }
  return true;
}

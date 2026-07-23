import { z as zod } from "zod";

/**
 * Cross-cutting API contract primitives (openapi_specification.md §2).
 * Reused by every endpoint's DTOs and by the frontend.
 */

/** Standard error envelope (004 R6, §2.8). */
export const ErrorDetail = zod.object({
  field: zod.string(),
  issue: zod.string(),
});
export const ErrorEnvelope = zod.object({
  error: zod.object({
    code: zod.string(),
    message: zod.string(),
    details: zod.array(ErrorDetail).optional(),
    request_id: zod.string(),
  }),
});
export type ErrorEnvelope = zod.infer<typeof ErrorEnvelope>;

/** Cursor pagination query params (004 R4, §2.5). */
export const PaginationQuery = zod.object({
  limit: zod.coerce.number().int().min(1).max(200).default(50),
  cursor: zod.string().optional(),
});
export type PaginationQuery = zod.infer<typeof PaginationQuery>;

/** Cursor pagination response envelope. `total_estimate` feeds the MUI X
 *  DataGrid `estimatedRowCount` (006). */
export const PageMeta = zod.object({
  limit: zod.number().int(),
  next_cursor: zod.string().nullable(),
  has_more: zod.boolean(),
  total_estimate: zod.number().int().nullable(),
});
export type PageMeta = zod.infer<typeof PageMeta>;

export function paginated<T extends zod.ZodTypeAny>(item: T) {
  return zod.object({ data: zod.array(item), page: PageMeta });
}

/** Money is ARS with 2 decimals; never float in transport either. */
export const Money = zod.coerce.number().multipleOf(0.01);
export type Money = zod.infer<typeof Money>;

/** Business date on the wire is ISO `yyyy-mm-dd` (004 C2). */
export const IsoDate = zod
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Expected date as yyyy-mm-dd" });
export type IsoDate = zod.infer<typeof IsoDate>;

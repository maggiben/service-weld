import { z } from "zod";

/**
 * Cross-cutting API contract primitives (openapi_specification.md §2).
 * Reused by every endpoint's DTOs and by the frontend.
 */

/** Standard error envelope (004 R6, §2.8). */
export const ErrorDetail = z.object({
  field: z.string(),
  issue: z.string(),
});
export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(ErrorDetail).optional(),
    request_id: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/** Cursor pagination query params (004 R4, §2.5). */
export const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

/** Cursor pagination response envelope. `total_estimate` feeds the MUI X
 *  DataGrid `estimatedRowCount` (006). */
export const PageMeta = z.object({
  limit: z.number().int(),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  total_estimate: z.number().int().nullable(),
});
export type PageMeta = z.infer<typeof PageMeta>;

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), page: PageMeta });
}

/** Money is ARS with 2 decimals; never float in transport either. */
export const Money = z.coerce.number().multipleOf(0.01);
export type Money = z.infer<typeof Money>;

/** Business date on the wire is ISO `yyyy-mm-dd` (004 C2). */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Expected date as yyyy-mm-dd" });
export type IsoDate = z.infer<typeof IsoDate>;

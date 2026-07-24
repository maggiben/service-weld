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

/**
 * Parse an ARS amount as typed in Argentina (`es-AR`):
 * - `,` separates centavos (decimal)
 * - `.` groups thousands (`15.000,50` → 15000.50)
 *
 * Also accepts plain digits and en-US-style decimals when there is no comma
 * and the part after `.` has 1–2 digits (`12.50` → 12.50). A single `.`
 * followed by exactly 3 digits is treated as thousands (`1.500` → 1500).
 */
export function parseMoneyInput(value: unknown): number | null {
  if (value === "" || value === undefined || value === null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(/ARS/gi, "");
  if (!trimmed) return null;

  let normalized: string;
  if (trimmed.includes(",")) {
    // es-AR: 15.000,50 or 15000,50
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length > 2 || (last.length === 3 && parts[0] !== "")) {
      // 1.500.000 or 1.500 → thousands grouping
      normalized = trimmed.replace(/\./g, "");
    } else {
      // 12.5 / 12.50 → decimal
      normalized = trimmed;
    }
  } else {
    normalized = trimmed;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Money field that accepts numbers or es-AR / en-US typed strings.
 * Empty / null stay null (does not coerce to 0).
 */
export const NullableMoneyInput = zod.preprocess(
  parseMoneyInput,
  Money.nullable(),
);
export type NullableMoneyInput = zod.infer<typeof NullableMoneyInput>;

/** Like {@link NullableMoneyInput} but rejects zero and negatives. */
export const PositiveNullableMoneyInput = zod.preprocess(
  parseMoneyInput,
  Money.positive().nullable(),
);
export type PositiveNullableMoneyInput = zod.infer<
  typeof PositiveNullableMoneyInput
>;

/** Business date on the wire is ISO `yyyy-mm-dd` (004 C2). */
export const IsoDate = zod
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Expected date as yyyy-mm-dd" });
export type IsoDate = zod.infer<typeof IsoDate>;

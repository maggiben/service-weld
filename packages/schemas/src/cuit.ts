import { z as zod } from "zod";

/**
 * CUIT (Argentine tax id) — BR-17.
 * Format `NN-NNNNNNNN-N` AND mod-11 check digit.
 * Enforced here (API/UI) and independently by the DB (ck_client_cuit_format
 * for format; check-digit validity is app-computed into `cuit_valid`).
 */

const CUIT_RE = /^\d{2}-\d{8}-\d$/;
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function isValidCuit(value: string): boolean {
  if (!CUIT_RE.test(value)) return false;
  const digits = value.replace(/-/g, "").split("").map(Number);
  const body = digits.slice(0, 10);
  const check = digits[10]!;
  const sum = body.reduce(
    (acc, data, index) => acc + data * WEIGHTS[index]!,
    0,
  );
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return expected === check;
}

export const Cuit = zod
  .string()
  .regex(CUIT_RE, { message: "CUIT must match NN-NNNNNNNN-N" })
  .refine(isValidCuit, { message: "Invalid CUIT check digit" });
export type Cuit = zod.infer<typeof Cuit>;

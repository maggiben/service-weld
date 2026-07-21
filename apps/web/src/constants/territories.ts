/**
 * Fallback route territories when GET /territories is unavailable.
 * Client-facing routes are Junín / Chacabuco only. "Ceres" is a
 * sub-distributor node (party), not an active client territory — see schema.sql.
 */
export const SEED_TERRITORIES = [
  { id: 1, name: "Junín" },
  { id: 2, name: "Chacabuco" },
] as const;

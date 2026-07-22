/**
 * Fallback route territories when GET /territories is unavailable.
 * Seed defaults are Junín / Chacabuco; additional territories are created
 * via POST /territories (e.g. from the users form autocomplete).
 * "Ceres" is seeded inactive as a sub-distributor node — see schema.sql.
 */
export const SEED_TERRITORIES = [
  { id: 1, name: "Junín" },
  { id: 2, name: "Chacabuco" },
] as const;

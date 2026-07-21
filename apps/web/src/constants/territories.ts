/**
 * Seed territories from schema.sql — used when the user has global territory
 * access (ADMIN/MANAGER/…) and `/auth/me` returns an empty scope list.
 * Replaced by GET /territories once that master-data endpoint lands.
 */
export const SEED_TERRITORIES = [
  { id: 1, name: "Junín" },
  { id: 2, name: "Chacabuco" },
  { id: 3, name: "Ceres" },
] as const;

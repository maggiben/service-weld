import { z as zod } from "zod";
import { paginated, PaginationQuery } from "./common";

/**
 * Collapse whitespace, NFC-normalize, and title-case words (es-AR).
 * Used before create and when matching typed input to existing rows.
 */
export function normalizeTerritoryName(raw: string): string {
  const collapsed = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!collapsed) return "";
  return collapsed
    .split(" ")
    .map((word) => {
      const first = word.charAt(0).toLocaleUpperCase("es-AR");
      const rest = word.slice(1).toLocaleLowerCase("es-AR");
      return `${first}${rest}`;
    })
    .join(" ");
}

/** Case- and diacritic-insensitive key for duplicate detection (e.g. junin ≈ Junín). */
export function territoryMatchKey(name: string): string {
  return normalizeTerritoryName(name)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-AR");
}

export const Territory = zod.object({
  id: zod.number().int(),
  name: zod.string(),
  is_active: zod.boolean(),
});
export type Territory = zod.infer<typeof Territory>;

export const CreateTerritoryInput = zod.object({
  name: zod
    .string()
    .transform(normalizeTerritoryName)
    .pipe(zod.string().min(1).max(120)),
});
export type CreateTerritoryInput = zod.infer<typeof CreateTerritoryInput>;

export const TerritoryListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
  "filter[is_active]": zod.enum(["true", "false"]).optional(),
});
export type TerritoryListQuery = zod.infer<typeof TerritoryListQuery>;

export const TerritoryListResponse = paginated(Territory);
export type TerritoryListResponse = zod.infer<typeof TerritoryListResponse>;

export const Locality = zod.object({
  id: zod.number().int(),
  name: zod.string(),
  province: zod.string(),
  territory_id: zod.number().int().nullable(),
  territory_name: zod.string().nullable().optional(),
  client_count: zod.number().int().optional(),
  /** Open holdings at clients in this locality (current float). */
  cylinder_count: zod.number().int().optional(),
});
export type Locality = zod.infer<typeof Locality>;

export const CreateLocalityInput = zod.object({
  name: zod.string().trim().min(1).max(120),
  province: zod
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .default("Buenos Aires"),
  territory_id: zod.number().int().nullable().optional(),
});
export type CreateLocalityInput = zod.infer<typeof CreateLocalityInput>;

export const LocalityListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
  "filter[territory_id]": zod.coerce.number().int().optional(),
  /** When true, only return localities that have at least one client. */
  "filter[has_clients]": zod.enum(["true", "false"]).optional(),
});
export type LocalityListQuery = zod.infer<typeof LocalityListQuery>;

export const LocalityListResponse = paginated(Locality);
export type LocalityListResponse = zod.infer<typeof LocalityListResponse>;

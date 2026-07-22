import { z } from "zod";
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

export const Territory = z.object({
  id: z.number().int(),
  name: z.string(),
  is_active: z.boolean(),
});
export type Territory = z.infer<typeof Territory>;

export const CreateTerritoryInput = z.object({
  name: z
    .string()
    .transform(normalizeTerritoryName)
    .pipe(z.string().min(1).max(120)),
});
export type CreateTerritoryInput = z.infer<typeof CreateTerritoryInput>;

export const TerritoryListQuery = PaginationQuery.extend({
  q: z.string().optional(),
  "filter[is_active]": z.enum(["true", "false"]).optional(),
});
export type TerritoryListQuery = z.infer<typeof TerritoryListQuery>;

export const TerritoryListResponse = paginated(Territory);
export type TerritoryListResponse = z.infer<typeof TerritoryListResponse>;

export const Locality = z.object({
  id: z.number().int(),
  name: z.string(),
  province: z.string(),
  territory_id: z.number().int().nullable(),
  territory_name: z.string().nullable().optional(),
  client_count: z.number().int().optional(),
  /** Open holdings at clients in this locality (current float). */
  cylinder_count: z.number().int().optional(),
});
export type Locality = z.infer<typeof Locality>;

export const CreateLocalityInput = z.object({
  name: z.string().trim().min(1).max(120),
  province: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .default("Buenos Aires"),
  territory_id: z.number().int().nullable().optional(),
});
export type CreateLocalityInput = z.infer<typeof CreateLocalityInput>;

export const LocalityListQuery = PaginationQuery.extend({
  q: z.string().optional(),
  "filter[territory_id]": z.coerce.number().int().optional(),
  /** When true, only return localities that have at least one client. */
  "filter[has_clients]": z.enum(["true", "false"]).optional(),
});
export type LocalityListQuery = z.infer<typeof LocalityListQuery>;

export const LocalityListResponse = paginated(Locality);
export type LocalityListResponse = z.infer<typeof LocalityListResponse>;

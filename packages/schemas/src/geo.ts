import { z } from "zod";
import { paginated, PaginationQuery } from "./common";

export const Territory = z.object({
  id: z.number().int(),
  name: z.string(),
  is_active: z.boolean(),
});
export type Territory = z.infer<typeof Territory>;

export const CreateTerritoryInput = z.object({
  name: z.string().trim().min(1).max(120),
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

/** Map MUI DataGrid sort model → API `sort` query param. */

export type SortDirField = { field: string; sort?: "asc" | "desc" | null };

export function buildSortParam<T extends string>(
  sortModel: readonly SortDirField[],
  allowedFields: readonly T[],
  defaultSort: T | `-${T}`,
): T | `-${T}` {
  if (sortModel.length === 0) return defaultSort;
  const { field, sort } = sortModel[0]!;
  if (!(allowedFields as readonly string[]).includes(field)) {
    return defaultSort;
  }
  const prefix = sort === "desc" ? "-" : "";
  return `${prefix}${field}` as T | `-${T}`;
}

export const CLIENT_SORT_FIELDS = [
  "name",
  "territory_id",
  "created_at",
] as const;

export const CYLINDER_SORT_FIELDS = [
  "serial_number",
  "updated_at",
  "state",
] as const;

export const MOVEMENT_SORT_FIELDS = ["delivery_date", "rental_days"] as const;

export function clientSortParam(
  sortModel: readonly SortDirField[],
):
  | (typeof CLIENT_SORT_FIELDS)[number]
  | `-${(typeof CLIENT_SORT_FIELDS)[number]}` {
  return buildSortParam(sortModel, CLIENT_SORT_FIELDS, "name");
}

export function cylinderSortParam(
  sortModel: readonly SortDirField[],
):
  | (typeof CYLINDER_SORT_FIELDS)[number]
  | `-${(typeof CYLINDER_SORT_FIELDS)[number]}` {
  return buildSortParam(sortModel, CYLINDER_SORT_FIELDS, "serial_number");
}

export function movementSortParam(
  sortModel: readonly SortDirField[],
):
  | (typeof MOVEMENT_SORT_FIELDS)[number]
  | `-${(typeof MOVEMENT_SORT_FIELDS)[number]}` {
  return buildSortParam(sortModel, MOVEMENT_SORT_FIELDS, "-delivery_date");
}

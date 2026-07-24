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
  "locality_id",
  "created_at",
  "outstanding_count",
] as const;

export const CYLINDER_SORT_FIELDS = [
  "serial_number",
  "updated_at",
  "state",
  "current_location_name",
  "gas_code",
  "capacity_m3",
  "ownership_basis",
  "owner_name",
  "current_holder_name",
  "condition",
  "home_territory_id",
] as const;

export const MOVEMENT_SORT_FIELDS = [
  "delivery_date",
  "return_date",
  "cylinder_serial",
  "holder_name",
  "property_basis",
  "movement_kind",
  "gas_code",
  "rental_days",
  "state",
  "capacity_m3",
  "locality_name",
  "owner_name",
] as const;

export const SUPPLIER_LOAN_SORT_FIELDS = [
  "received_from_supplier",
  "returned_by_client",
  "client_name",
  "cylinder_serial",
  "supplier_name",
  "stage",
] as const;

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

export function supplierLoanSortParam(
  sortModel: readonly SortDirField[],
):
  | (typeof SUPPLIER_LOAN_SORT_FIELDS)[number]
  | `-${(typeof SUPPLIER_LOAN_SORT_FIELDS)[number]}` {
  return buildSortParam(
    sortModel,
    SUPPLIER_LOAN_SORT_FIELDS,
    "received_from_supplier",
  );
}

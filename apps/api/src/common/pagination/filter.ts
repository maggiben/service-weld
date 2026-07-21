type FilterOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in";

export interface ParsedFilter {
  field: string;
  operator: FilterOperator;
  value: string | string[];
}

const FILTER_KEY = /^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/;

/**
 * Parses `filter[field]` and `filter[field][op]` query params safely.
 * Unknown operators are ignored; only whitelisted fields should be passed in.
 */
export function parseFilters(
  query: Record<string, unknown>,
  allowedFields: readonly string[],
): ParsedFilter[] {
  const allowed = new Set(allowedFields);
  const filters: ParsedFilter[] = [];

  for (const [key, rawValue] of Object.entries(query)) {
    const match = FILTER_KEY.exec(key);
    if (!match) continue;

    const field = match[1];
    const operator = (match[2] ?? "eq") as FilterOperator;
    if (!field || !allowed.has(field)) continue;
    if (
      operator !== "eq" &&
      operator !== "ne" &&
      operator !== "gt" &&
      operator !== "gte" &&
      operator !== "lt" &&
      operator !== "lte" &&
      operator !== "in"
    ) {
      continue;
    }

    if (rawValue == null || rawValue === "") continue;

    if (operator === "in") {
      const values = Array.isArray(rawValue)
        ? rawValue.map(String)
        : String(rawValue)
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
      filters.push({ field, operator, value: values });
      continue;
    }

    filters.push({ field, operator, value: String(rawValue) });
  }

  return filters;
}

export function readFilterValue(
  filters: ParsedFilter[],
  field: string,
): string | undefined {
  const match = filters.find(
    (filter) => filter.field === field && filter.operator === "eq",
  );
  return match ? String(match.value) : undefined;
}

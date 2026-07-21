import type { PageMeta } from "@weld/schemas";

export interface CursorPayload {
  [key: string]: string | number | null;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Invalid cursor");
    }
    return parsed as CursorPayload;
  } catch {
    throw new Error("Invalid cursor");
  }
}

export function buildPageMeta(input: {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  totalEstimate?: number | null;
}): PageMeta {
  return {
    limit: input.limit,
    has_more: input.hasMore,
    next_cursor: input.nextCursor,
    total_estimate: input.totalEstimate ?? null,
  };
}

export interface SortSpec {
  field: string;
  direction: "asc" | "desc";
}

export function parseSort(
  sort: string,
  whitelist: readonly string[],
  defaultField = "name",
): SortSpec {
  const normalized = sort.startsWith("-") ? sort.slice(1) : sort;
  const direction: "asc" | "desc" = sort.startsWith("-") ? "desc" : "asc";
  if (!whitelist.includes(normalized)) {
    throw new Error(`Unknown sort field: ${normalized}`);
  }
  return { field: normalized, direction };
}

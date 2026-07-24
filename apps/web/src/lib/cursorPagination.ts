/** Cursor pagination helpers shared by DataGrid list pages. */

export type CursorList = Array<string | undefined>;

/** Store the next page's cursor after a successful fetch. */
export function stashNextCursor(
  cursors: CursorList,
  page: number,
  nextCursor: string | undefined,
): CursorList {
  if (!nextCursor) return cursors;
  const next = [...cursors];
  next[page + 1] = nextCursor;
  return next;
}

/**
 * DataGrid rowCount for cursor pages: current offset + rows + optional
 * "next page exists" sentinel when has_more.
 *
 * Prefer {@link cursorGridServerPagination} for live grids — this estimate
 * alone collapses to `page * pageSize` while the next page is loading, which
 * makes MUI clamp the controlled page back to 0.
 */
export function cursorPageRowCount(
  page: number,
  pageSize: number,
  rowCount: number,
  hasMore: boolean,
): number {
  return page * pageSize + rowCount + (hasMore ? 1 : 0);
}

/**
 * DataGrid server-mode props for cursor APIs (specs/006): unknown `rowCount`
 * plus `paginationMeta.hasNextPage` so the page does not snap back mid-fetch.
 * Pair with TanStack `placeholderData: keepPreviousData` and skip
 * {@link stashNextCursor} while `isPlaceholderData` is true.
 */
export function cursorGridServerPagination(input: {
  page: number;
  pageSize: number;
  loadedCount: number;
  hasMore: boolean | undefined;
}): {
  rowCount: -1;
  estimatedRowCount: number | undefined;
  paginationMeta: { hasNextPage: boolean };
} {
  const hasMore = input.hasMore === true;
  return {
    rowCount: -1,
    estimatedRowCount:
      input.hasMore == null
        ? undefined
        : cursorPageRowCount(
            input.page,
            input.pageSize,
            input.loadedCount,
            hasMore,
          ),
    paginationMeta: { hasNextPage: hasMore },
  };
}

export function shouldResetCursors(
  nextPageSize: number,
  currentPageSize: number,
): boolean {
  return nextPageSize !== currentPageSize;
}

/** Apply a pagination model change, resetting to page 0 when page size changes. */
export function paginationAfterChange(
  current: { page: number; pageSize: number },
  next: { page: number; pageSize: number },
): {
  pagination: { page: number; pageSize: number };
  resetCursors: boolean;
} {
  if (shouldResetCursors(next.pageSize, current.pageSize)) {
    return {
      pagination: { page: 0, pageSize: next.pageSize },
      resetCursors: true,
    };
  }
  return { pagination: next, resetCursors: false };
}

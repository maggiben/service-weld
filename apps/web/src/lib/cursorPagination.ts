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
 */
export function cursorPageRowCount(
  page: number,
  pageSize: number,
  rowCount: number,
  hasMore: boolean,
): number {
  return page * pageSize + rowCount + (hasMore ? 1 : 0);
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

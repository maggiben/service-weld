import type { Kysely } from "kysely";
import { formatRemitoSeriesNumber } from "@weld/domain";
import { ApiErrors } from "../common/errors/api-error";
import type { Database } from "../database/schema.types";

export interface AllocateRemitoNumberOpts {
  seriesId?: number;
  seriesCode?: string;
}

/**
 * Atomically claim the next remito number from an active series (row lock).
 * Callers must run inside the request transaction so FOR UPDATE holds.
 */
export async function allocateRemitoNumber(
  db: Kysely<Database>,
  opts?: AllocateRemitoNumberOpts,
): Promise<{ seriesId: number; remitoNumber: string }> {
  let qb = db
    .selectFrom("remito_series")
    .select(["id", "code", "pad_width", "next_number"])
    .where("is_active", "=", true);

  if (opts?.seriesId != null) {
    qb = qb.where("id", "=", opts.seriesId);
  } else if (opts?.seriesCode) {
    qb = qb.where("code", "=", opts.seriesCode);
  } else {
    qb = qb.where("code", "=", "A");
  }

  const series = await qb.forUpdate().executeTakeFirst();
  if (!series) {
    throw ApiErrors.notFound("Remito series not found");
  }

  const nextNumber = Number(series.next_number);
  const padWidth = Number(series.pad_width);
  const remitoNumber = formatRemitoSeriesNumber(
    series.code,
    nextNumber,
    padWidth,
  );

  await db
    .updateTable("remito_series")
    .set({ next_number: nextNumber + 1 })
    .where("id", "=", series.id)
    .execute();

  return { seriesId: Number(series.id), remitoNumber };
}

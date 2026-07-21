import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";

export const StockTransfer = z.object({
  id: z.number().int(),
  cylinder_id: z.number().int(),
  cylinder_serial: z.string().optional(),
  from_party_id: z.number().int(),
  from_party_name: z.string().optional(),
  to_party_id: z.number().int(),
  to_party_name: z.string().optional(),
  transfer_date: IsoDate,
  note: z.string().nullable(),
  created_at: z.string().datetime(),
});
export type StockTransfer = z.infer<typeof StockTransfer>;

export const CreateStockTransferInput = z.object({
  cylinder_id: z.number().int(),
  from_party_id: z.number().int(),
  to_party_id: z.number().int(),
  transfer_date: IsoDate,
  note: z.string().nullable().optional(),
});
export type CreateStockTransferInput = z.infer<typeof CreateStockTransferInput>;

export const StockTransferListQuery = PaginationQuery.extend({
  sort: z.enum(["transfer_date", "-transfer_date"]).default("-transfer_date"),
  "filter[cylinder_id]": z.coerce.number().int().optional(),
  "filter[to_party_id]": z.coerce.number().int().optional(),
  "filter[from_party_id]": z.coerce.number().int().optional(),
  "filter[transfer_date][gte]": IsoDate.optional(),
  "filter[transfer_date][lte]": IsoDate.optional(),
});
export type StockTransferListQuery = z.infer<typeof StockTransferListQuery>;

export const StockTransferListResponse = paginated(StockTransfer);
export type StockTransferListResponse = z.infer<
  typeof StockTransferListResponse
>;

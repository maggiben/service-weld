import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { PartyType } from "./enums";

export const TransferCustodyStatus = zod.enum(["LOANED", "REFILL", "CUSTODY"]);
export type TransferCustodyStatus = zod.infer<typeof TransferCustodyStatus>;

export const StockTransfer = zod.object({
  id: zod.number().int(),
  cylinder_id: zod.number().int(),
  cylinder_serial: zod.string().optional(),
  from_party_id: zod.number().int(),
  from_party_name: zod.string().optional(),
  from_party_type: PartyType.optional(),
  to_party_id: zod.number().int(),
  to_party_name: zod.string().optional(),
  to_party_type: PartyType.optional(),
  transfer_date: IsoDate,
  return_date: IsoDate.nullable(),
  custody_status: TransferCustodyStatus,
  note: zod.string().nullable(),
  created_at: zod.string().datetime(),
});
export type StockTransfer = zod.infer<typeof StockTransfer>;

export const CreateStockTransferInput = zod.object({
  cylinder_id: zod.number().int(),
  from_party_id: zod.number().int(),
  to_party_id: zod.number().int(),
  transfer_date: IsoDate,
  return_date: IsoDate.nullable().optional(),
  note: zod.string().nullable().optional(),
});
export type CreateStockTransferInput = zod.infer<
  typeof CreateStockTransferInput
>;

export const CloseStockTransferInput = zod.object({
  return_date: IsoDate,
});
export type CloseStockTransferInput = zod.infer<typeof CloseStockTransferInput>;

export const StockTransferListQuery = PaginationQuery.extend({
  sort: zod.enum(["transfer_date", "-transfer_date"]).default("-transfer_date"),
  "filter[cylinder_id]": zod.coerce.number().int().optional(),
  "filter[to_party_id]": zod.coerce.number().int().optional(),
  "filter[from_party_id]": zod.coerce.number().int().optional(),
  "filter[transfer_date][gte]": IsoDate.optional(),
  "filter[transfer_date][lte]": IsoDate.optional(),
  open: zod.coerce.boolean().optional(),
});
export type StockTransferListQuery = zod.infer<typeof StockTransferListQuery>;

export const StockTransferListResponse = paginated(StockTransfer);
export type StockTransferListResponse = zod.infer<
  typeof StockTransferListResponse
>;

import { createZodDto } from "nestjs-zod";
import {
  CloseStockTransferInput,
  CreateStockTransferInput,
  StockTransferListQuery,
  StockTransferListResponse,
} from "@weld/schemas";

export class CreateStockTransferDto extends createZodDto(
  CreateStockTransferInput,
) {}
export class CloseStockTransferDto extends createZodDto(
  CloseStockTransferInput,
) {}
export class StockTransferListQueryDto extends createZodDto(
  StockTransferListQuery,
) {}
export class StockTransferListResponseDto extends createZodDto(
  StockTransferListResponse,
) {}

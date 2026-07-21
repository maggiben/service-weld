import { createZodDto } from "nestjs-zod";
import {
  CreateStockTransferInput,
  StockTransferListQuery,
  StockTransferListResponse,
} from "@weld/schemas";

export class CreateStockTransferDto extends createZodDto(
  CreateStockTransferInput,
) {}
export class StockTransferListQueryDto extends createZodDto(
  StockTransferListQuery,
) {}
export class StockTransferListResponseDto extends createZodDto(
  StockTransferListResponse,
) {}

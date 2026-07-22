import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { StockTransfer } from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  CloseStockTransferDto,
  CreateStockTransferDto,
  StockTransferListQueryDto,
  StockTransferListResponseDto,
} from "./dto/transfers.dto";
import { TransfersService } from "./transfers.service";

@ApiTags("Transfers")
@ApiBearerAuth()
@Controller("transfers")
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @RequireCapabilities("transfers:read")
  @ApiOkResponse({ type: StockTransferListResponseDto })
  list(@Query() query: StockTransferListQueryDto) {
    return this.transfersService.list(query);
  }

  @Post()
  @RequireCapabilities("transfers:write")
  @ApiCreatedResponse({ description: "Stock transfer recorded" })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateStockTransferDto,
  ): Promise<StockTransfer> {
    return this.transfersService.create(user, body);
  }

  @Patch(":id/close")
  @RequireCapabilities("transfers:write")
  @ApiOkResponse({ description: "Transfer entry (return) date recorded" })
  close(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: CloseStockTransferDto,
  ): Promise<StockTransfer> {
    return this.transfersService.close(id, body);
  }

  @Get(":id")
  @RequireCapabilities("transfers:read")
  @ApiOkResponse({ description: "Transfer detail" })
  getById(@Param("id", ParseIntPipe) id: number): Promise<StockTransfer> {
    return this.transfersService.getById(id);
  }
}

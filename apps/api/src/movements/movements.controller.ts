import {
  Body,
  Controller,
  Get,
  Headers,
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
import type { MovementEvent } from "@weld/schemas";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import type { AuthPrincipal } from "../auth/principal";
import { MovementsService } from "./movements.service";
import {
  CreateMovementDto,
  MovementListQueryDto,
  MovementListResponseDto,
  RecordSalePriceDto,
  ReturnMovementDto,
  SwapMovementDto,
  VoidMovementDto,
} from "./dto/movements.dto";

@ApiTags("Movements")
@ApiBearerAuth()
@Controller("movements")
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  @RequireCapabilities("movements:read")
  @ApiOkResponse({ type: MovementListResponseDto })
  list(@Query() query: MovementListQueryDto) {
    return this.movementsService.list(query);
  }

  @Post()
  @RequireCapabilities("movements:write")
  @ApiCreatedResponse({ description: "Opened movement (delivery)" })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateMovementDto,
  ): Promise<MovementEvent> {
    return this.movementsService.create(user, body);
  }

  @Get(":id")
  @RequireCapabilities("movements:read")
  @ApiOkResponse({ description: "Movement detail" })
  getById(@Param("id", ParseIntPipe) id: number): Promise<MovementEvent> {
    return this.movementsService.getById(id);
  }

  @Patch(":id/return")
  @RequireCapabilities("movements:write")
  @ApiOkResponse({ description: "Closed movement with rental_days" })
  returnMovement(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ReturnMovementDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<MovementEvent> {
    return this.movementsService.returnMovement(
      user,
      id,
      body,
      parseIfMatch(ifMatch),
    );
  }

  @Patch(":id/swap")
  @RequireCapabilities("movements:write")
  @ApiOkResponse({ description: "Swapped return (W9)" })
  swap(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: SwapMovementDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<MovementEvent> {
    return this.movementsService.swap(user, id, body, parseIfMatch(ifMatch));
  }

  @Post(":id/void")
  @RequireCapabilities("movements:void")
  @ApiOkResponse({ description: "Voided movement (append-only)" })
  voidMovement(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: VoidMovementDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<MovementEvent> {
    return this.movementsService.void(user, id, body, parseIfMatch(ifMatch));
  }

  @Post(":id/record-sale-price")
  @RequireCapabilities("movements:write")
  @ApiOkResponse({
    description:
      "Create missing cylinder_sale for a SALE movement posted without a price",
  })
  recordSalePrice(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RecordSalePriceDto,
  ): Promise<MovementEvent> {
    return this.movementsService.recordSalePrice(user, id, body);
  }
}

function parseIfMatch(ifMatch?: string): number | undefined {
  if (!ifMatch) return undefined;
  const version = Number(ifMatch.replaceAll('"', ""));
  return Number.isFinite(version) ? version : undefined;
}

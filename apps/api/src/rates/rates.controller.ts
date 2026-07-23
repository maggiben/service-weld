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
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  BackfillRentalRatesInput,
  type BackfillRentalRatesResult,
  type RentalRate,
} from "@weld/schemas";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import { ApiErrors } from "../common/errors/api-error";
import type { AuthPrincipal } from "../auth/principal";
import { RatesService } from "./rates.service";
import {
  CreateRentalRateDto,
  RentalRateListQueryDto,
  RentalRateListResponseDto,
  UpdateRentalRateDto,
} from "./dto/rates.dto";

@ApiTags("Rental rates")
@ApiBearerAuth()
@Controller("rental-rates")
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get()
  @RequireCapabilities("rates:read")
  @ApiOkResponse({ type: RentalRateListResponseDto })
  list(@Query() query: RentalRateListQueryDto) {
    return this.ratesService.list(query);
  }

  @Post()
  @RequireCapabilities("rates:write")
  @ApiCreatedResponse({ description: "Created rental rate" })
  create(@Body() body: CreateRentalRateDto): Promise<RentalRate> {
    return this.ratesService.create(body);
  }

  /**
   * Avoid createZodDto for backfill I/O — nestjs-zod OpenAPI metadata crashes
   * on these schemas during Swagger bootstrap (`_zod` in undefined).
   */
  @Post("backfill")
  @RequireCapabilities("rates:write", "billing:write")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        rate_id: {
          type: "integer",
          nullable: true,
          description:
            "Optional rate id; scopes client defaults + history billing draft",
        },
      },
    },
  })
  @ApiOkResponse({
    description: "Backfill applied; history billing draft created",
  })
  backfill(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: unknown,
  ): Promise<BackfillRentalRatesResult> {
    const parsed = BackfillRentalRatesInput.safeParse(body ?? {});
    if (!parsed.success) {
      throw ApiErrors.validationFailed("Invalid backfill input", [
        { field: "rate_id", issue: "Must be a positive integer when set" },
      ]);
    }
    return this.ratesService.backfill(user, parsed.data);
  }

  @Patch(":id")
  @RequireCapabilities("rates:write")
  @ApiOkResponse({ description: "Updated rental rate" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateRentalRateDto,
  ): Promise<RentalRate> {
    return this.ratesService.update(id, body);
  }
}

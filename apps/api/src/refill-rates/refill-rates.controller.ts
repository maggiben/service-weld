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
  BackfillRefillRatesInput,
  type BackfillRefillRatesResult,
  type RefillRate,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import { ApiErrors } from "../common/errors/api-error";
import { RefillRatesService } from "./refill-rates.service";
import {
  CreateRefillRateDto,
  RefillRateListQueryDto,
  RefillRateListResponseDto,
  UpdateRefillRateDto,
} from "./dto/refill-rates.dto";

@ApiTags("Refill rates")
@ApiBearerAuth()
@Controller("refill-rates")
export class RefillRatesController {
  constructor(private readonly refillRatesService: RefillRatesService) {}

  @Get()
  @RequireCapabilities("rates:read")
  @ApiOkResponse({ type: RefillRateListResponseDto })
  list(@Query() query: RefillRateListQueryDto) {
    return this.refillRatesService.list(query);
  }

  @Post()
  @RequireCapabilities("rates:write")
  @ApiCreatedResponse({ description: "Created refill rate" })
  create(@Body() body: CreateRefillRateDto): Promise<RefillRate> {
    return this.refillRatesService.create(body);
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
            "Optional rate id; verifies the row exists (billing is always global)",
        },
      },
    },
  })
  @ApiOkResponse({
    description: "History billing draft created for open refills",
  })
  backfill(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: unknown,
  ): Promise<BackfillRefillRatesResult> {
    const parsed = BackfillRefillRatesInput.safeParse(body ?? {});
    if (!parsed.success) {
      throw ApiErrors.validationFailed("Invalid backfill input", [
        { field: "rate_id", issue: "Must be a positive integer when set" },
      ]);
    }
    return this.refillRatesService.backfill(user, parsed.data);
  }

  @Patch(":id")
  @RequireCapabilities("rates:write")
  @ApiOkResponse({ description: "Updated refill rate" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateRefillRateDto,
  ): Promise<RefillRate> {
    return this.refillRatesService.update(id, body);
  }
}

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
import type { RentalRate } from "@weld/schemas";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
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

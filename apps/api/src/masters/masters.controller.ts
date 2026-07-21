import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Locality, Territory } from "@weld/schemas";
import {
  CreateLocalityDto,
  CreateTerritoryDto,
  LocalityListQueryDto,
  LocalityListResponseDto,
  TerritoryListQueryDto,
  TerritoryListResponseDto,
} from "./dto/masters.dto";
import { MastersService } from "./masters.service";

@ApiTags("Masters")
@ApiBearerAuth()
@Controller()
export class MastersController {
  constructor(private readonly mastersService: MastersService) {}

  @Get("territories")
  @ApiOkResponse({ type: TerritoryListResponseDto })
  listTerritories(@Query() query: TerritoryListQueryDto) {
    return this.mastersService.listTerritories(query);
  }

  @Post("territories")
  @ApiCreatedResponse({ description: "Created territory" })
  createTerritory(@Body() body: CreateTerritoryDto): Promise<Territory> {
    return this.mastersService.createTerritory(body);
  }

  @Get("localities")
  @ApiOkResponse({ type: LocalityListResponseDto })
  listLocalities(@Query() query: LocalityListQueryDto) {
    return this.mastersService.listLocalities(query);
  }

  @Post("localities")
  @ApiCreatedResponse({ description: "Created locality" })
  createLocality(@Body() body: CreateLocalityDto): Promise<Locality> {
    return this.mastersService.createLocality(body);
  }
}

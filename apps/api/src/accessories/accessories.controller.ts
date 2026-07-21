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
import type { Accessory, AccessoryRental } from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  AccessoryListQueryDto,
  AccessoryListResponseDto,
  AccessoryRentalListQueryDto,
  AccessoryRentalListResponseDto,
  CreateAccessoryDto,
  CreateAccessoryRentalDto,
  ReturnAccessoryRentalDto,
  UpdateAccessoryDto,
} from "./dto/accessories.dto";
import { AccessoriesService } from "./accessories.service";

@ApiTags("Accessories")
@ApiBearerAuth()
@Controller()
export class AccessoriesController {
  constructor(private readonly accessoriesService: AccessoriesService) {}

  @Get("accessories")
  @RequireCapabilities("accessories:read")
  @ApiOkResponse({ type: AccessoryListResponseDto })
  list(@Query() query: AccessoryListQueryDto) {
    return this.accessoriesService.listAccessories(query);
  }

  @Post("accessories")
  @RequireCapabilities("accessories:write")
  @ApiCreatedResponse({ description: "Accessory created" })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateAccessoryDto,
  ): Promise<Accessory> {
    return this.accessoriesService.createAccessory(user, body);
  }

  @Get("accessories/:id")
  @RequireCapabilities("accessories:read")
  @ApiOkResponse({ description: "Accessory detail" })
  getById(@Param("id", ParseIntPipe) id: number): Promise<Accessory> {
    return this.accessoriesService.getAccessory(id);
  }

  @Patch("accessories/:id")
  @RequireCapabilities("accessories:write")
  @ApiOkResponse({ description: "Accessory updated" })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateAccessoryDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<Accessory> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.accessoriesService.updateAccessory(
      user,
      id,
      body,
      Number.isFinite(version) ? version : undefined,
    );
  }

  @Get("accessory-rentals")
  @RequireCapabilities("accessories:read")
  @ApiOkResponse({ type: AccessoryRentalListResponseDto })
  listRentals(@Query() query: AccessoryRentalListQueryDto) {
    return this.accessoriesService.listRentals(query);
  }

  @Post("accessory-rentals")
  @RequireCapabilities("accessories:write")
  @ApiCreatedResponse({ description: "Accessory rented" })
  createRental(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateAccessoryRentalDto,
  ): Promise<AccessoryRental> {
    return this.accessoriesService.createRental(user, body);
  }

  @Patch("accessory-rentals/:id/return")
  @RequireCapabilities("accessories:write")
  @ApiOkResponse({ description: "Accessory returned" })
  returnRental(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ReturnAccessoryRentalDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<AccessoryRental> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.accessoriesService.returnRental(
      user,
      id,
      body,
      Number.isFinite(version) ? version : undefined,
    );
  }
}

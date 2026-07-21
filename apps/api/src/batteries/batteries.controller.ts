import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Battery } from "@weld/schemas";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import type { AuthPrincipal } from "../auth/principal";
import { BatteriesService } from "./batteries.service";
import {
  AddBatteryMemberDto,
  BatteryListQueryDto,
  BatteryListResponseDto,
  CreateBatteryDto,
} from "./dto/batteries.dto";

@ApiTags("Batteries")
@ApiBearerAuth()
@Controller("batteries")
export class BatteriesController {
  constructor(private readonly batteriesService: BatteriesService) {}

  @Get()
  @RequireCapabilities("batteries:read")
  @ApiOkResponse({ type: BatteryListResponseDto })
  list(@Query() query: BatteryListQueryDto) {
    return this.batteriesService.list(query);
  }

  @Post()
  @RequireCapabilities("batteries:write")
  @ApiCreatedResponse({ description: "Created battery with members" })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateBatteryDto,
  ): Promise<Battery> {
    return this.batteriesService.create(user, body);
  }

  @Get(":id")
  @RequireCapabilities("batteries:read")
  @ApiOkResponse({ description: "Battery detail with members" })
  getById(@Param("id", ParseIntPipe) id: number): Promise<Battery> {
    return this.batteriesService.getById(id);
  }

  @Post(":id/members")
  @RequireCapabilities("batteries:write")
  @ApiOkResponse({ description: "Member added" })
  addMember(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: AddBatteryMemberDto,
  ): Promise<Battery> {
    return this.batteriesService.addMember(user, id, body);
  }

  @Delete(":id/members/:cylinderId")
  @RequireCapabilities("batteries:write")
  @ApiOkResponse({ description: "Member removed" })
  removeMember(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Param("cylinderId", ParseIntPipe) cylinderId: number,
  ): Promise<Battery> {
    return this.batteriesService.removeMember(user, id, cylinderId);
  }
}

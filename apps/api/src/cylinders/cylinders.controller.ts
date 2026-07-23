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
import type {
  Cylinder,
  CylinderHistoryResponse,
  ReportCylinderLossResponse,
  ReplaceCylinderResponse,
} from "@weld/schemas";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import type { AuthPrincipal } from "../auth/principal";
import { CylindersService } from "./cylinders.service";
import {
  CreateCylinderDto,
  CylinderHistoryQueryDto,
  CylinderHistoryResponseDto,
  CylinderListQueryDto,
  CylinderListResponseDto,
  ReplaceCylinderDto,
  ReportCylinderLossDto,
  UpdateCylinderDto,
} from "./dto/cylinders.dto";

@ApiTags("Cylinders")
@ApiBearerAuth()
@Controller("cylinders")
export class CylindersController {
  constructor(private readonly cylindersService: CylindersService) {}

  @Get()
  @RequireCapabilities("cylinders:read")
  @ApiOkResponse({ type: CylinderListResponseDto })
  list(@Query() query: CylinderListQueryDto) {
    return this.cylindersService.list(query);
  }

  @Post()
  @RequireCapabilities("cylinders:write")
  @ApiCreatedResponse({ description: "Created cylinder" })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateCylinderDto,
  ): Promise<Cylinder> {
    return this.cylindersService.create(user, body);
  }

  @Get(":id/history")
  @RequireCapabilities("cylinders:read")
  @ApiOkResponse({ type: CylinderHistoryResponseDto })
  getHistory(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: CylinderHistoryQueryDto,
  ): Promise<CylinderHistoryResponse> {
    return this.cylindersService.getHistory(id, query);
  }

  @Get(":id")
  @RequireCapabilities("cylinders:read")
  @ApiOkResponse({ description: "Cylinder detail" })
  getById(@Param("id", ParseIntPipe) id: number): Promise<Cylinder> {
    return this.cylindersService.getById(id);
  }

  @Patch(":id")
  @RequireCapabilities("cylinders:write")
  @ApiOkResponse({ description: "Cylinder attributes corrected" })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateCylinderDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<Cylinder> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.cylindersService.update(
      user,
      id,
      body,
      Number.isFinite(version) ? version : undefined,
    );
  }

  @Post(":id/fill")
  @RequireCapabilities("cylinders:write")
  @ApiOkResponse({
    description: "Empty stock cylinder marked full / ready to dispatch",
  })
  fill(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Headers("if-match") ifMatch?: string,
  ): Promise<Cylinder> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.cylindersService.fill(
      user,
      id,
      Number.isFinite(version) ? version : undefined,
    );
  }

  @Post(":id/empty")
  @RequireCapabilities("cylinders:write")
  @ApiOkResponse({
    description: "Full stock cylinder marked empty",
  })
  empty(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Headers("if-match") ifMatch?: string,
  ): Promise<Cylinder> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.cylindersService.empty(
      user,
      id,
      Number.isFinite(version) ? version : undefined,
    );
  }

  @Post(":id/loss")
  @RequireCapabilities("cylinders:write")
  @ApiOkResponse({ description: "Cylinder marked LOST/BROKEN (W12)" })
  reportLoss(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ReportCylinderLossDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<ReportCylinderLossResponse> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.cylindersService.reportLoss(
      user,
      id,
      body,
      Number.isFinite(version) ? version : undefined,
    );
  }

  @Post(":id/replace")
  @RequireCapabilities("cylinders:write")
  @ApiCreatedResponse({ description: "Replacement issued (W13)" })
  replace(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ReplaceCylinderDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<ReplaceCylinderResponse> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.cylindersService.replace(
      user,
      id,
      body,
      Number.isFinite(version) ? version : undefined,
    );
  }
}

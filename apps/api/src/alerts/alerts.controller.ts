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
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Alert, RefreshAlertsResult } from "@weld/schemas";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  AlertListQueryDto,
  AlertListResponseDto,
  AlertSummaryDto,
  AlertSummaryQueryDto,
  RefreshAlertsResultDto,
  UpdateAlertContactDto,
} from "./dto/alerts.dto";
import { AlertsService } from "./alerts.service";

@ApiTags("Alerts")
@ApiBearerAuth()
@Controller("alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @RequireCapabilities("alerts:read")
  @ApiOkResponse({ type: AlertListResponseDto })
  list(@Query() query: AlertListQueryDto) {
    return this.alertsService.list(query);
  }

  @Get("summary")
  @RequireCapabilities("alerts:read")
  @ApiOkResponse({ type: AlertSummaryDto })
  summary(@Query() query: AlertSummaryQueryDto) {
    return this.alertsService.summary(query);
  }

  @Post("refresh")
  @RequireCapabilities("alerts:write")
  @ApiOkResponse({ type: RefreshAlertsResultDto })
  refresh(): Promise<RefreshAlertsResult> {
    return this.alertsService.refresh();
  }

  @Patch(":id/resolve")
  @RequireCapabilities("alerts:write")
  @ApiOkResponse({ description: "Alert resolved" })
  resolve(@Param("id", ParseIntPipe) id: number): Promise<Alert> {
    return this.alertsService.resolve(id);
  }

  @Patch(":id/contact")
  @RequireCapabilities("alerts:write")
  @ApiOkResponse({ description: "Alert contact follow-up updated" })
  updateContact(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateAlertContactDto,
  ): Promise<Alert> {
    return this.alertsService.updateContact(id, body);
  }
}

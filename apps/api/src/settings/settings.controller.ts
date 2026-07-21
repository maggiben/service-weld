import { Body, Controller, Get, Headers, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { SystemSettings } from "@weld/schemas";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import { UpdateSystemSettingsDto } from "./dto/settings.dto";
import { SettingsService } from "./settings.service";

@ApiTags("Settings")
@ApiBearerAuth()
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequireCapabilities("supplier_loans:read")
  @ApiOkResponse({ description: "Current system settings" })
  get(): Promise<SystemSettings> {
    return this.settingsService.getSettings();
  }

  @Patch()
  @RequireCapabilities("supplier_loans:write")
  @ApiOkResponse({ description: "Updated system settings" })
  update(
    @Body() body: UpdateSystemSettingsDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<SystemSettings> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.settingsService.updateSettings(
      body,
      Number.isFinite(version) ? version : undefined,
    );
  }
}

import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { AlertsController } from "./alerts.controller";
import { AlertsRepository } from "./alerts.repository";
import { AlertsService } from "./alerts.service";

@Module({
  imports: [SettingsModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsRepository],
  exports: [AlertsService],
})
export class AlertsModule {}

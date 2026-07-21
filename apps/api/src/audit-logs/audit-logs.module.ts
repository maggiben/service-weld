import { Module } from "@nestjs/common";
import { AuditLogsController } from "./audit-logs.controller";
import { AuditLogsRepository } from "./audit-logs.repository";
import { AuditLogsService } from "./audit-logs.service";

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditLogsRepository],
})
export class AuditLogsModule {}

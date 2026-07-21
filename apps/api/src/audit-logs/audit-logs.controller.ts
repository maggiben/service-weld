import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  AuditLogListQueryDto,
  AuditLogListResponseDto,
} from "./dto/audit-logs.dto";
import { AuditLogsService } from "./audit-logs.service";

@ApiTags("Audit")
@ApiBearerAuth()
@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @RequireCapabilities("audit:read")
  @ApiOkResponse({ type: AuditLogListResponseDto })
  list(@Query() query: AuditLogListQueryDto) {
    return this.auditLogsService.list(query);
  }
}

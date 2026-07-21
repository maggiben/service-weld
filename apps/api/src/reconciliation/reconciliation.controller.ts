import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { PhysicalCountResult } from "@weld/schemas";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  OutstandingListQueryDto,
  OutstandingListResponseDto,
  PhysicalCountInputDto,
  PhysicalCountResultDto,
} from "./dto/reconciliation.dto";
import { ReconciliationService } from "./reconciliation.service";

@ApiTags("Reconciliation")
@ApiBearerAuth()
@Controller()
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get("reports/outstanding")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: OutstandingListResponseDto })
  listOutstanding(@Query() query: OutstandingListQueryDto) {
    return this.reconciliationService.listOutstanding(query);
  }

  @Post("reconciliation/physical-count")
  @RequireCapabilities("cylinders:write")
  @ApiOkResponse({ type: PhysicalCountResultDto })
  physicalCount(
    @Body() body: PhysicalCountInputDto,
  ): Promise<PhysicalCountResult> {
    return this.reconciliationService.runPhysicalCount(body);
  }
}

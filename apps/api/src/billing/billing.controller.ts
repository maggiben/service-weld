import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { BillingExportPayload, BillingRunDetail } from "@weld/schemas";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import type { AuthPrincipal } from "../auth/principal";
import { BillingService } from "./billing.service";
import { CreateBillingRunDto } from "./dto/billing.dto";

@ApiTags("Billing")
@ApiBearerAuth()
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post("runs")
  @RequireCapabilities("billing:write")
  @ApiAcceptedResponse({ description: "Draft billing run created" })
  createRun(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateBillingRunDto,
  ): Promise<BillingRunDetail> {
    return this.billingService.createDraft(user, body);
  }

  @Get("runs/:id")
  @RequireCapabilities("billing:read")
  @ApiOkResponse({ description: "Billing run with invoices" })
  getRun(@Param("id", ParseIntPipe) id: number): Promise<BillingRunDetail> {
    return this.billingService.getRun(id);
  }

  @Post("runs/:id/approve")
  @RequireCapabilities("billing:approve")
  @ApiOkResponse({ description: "Draft approved" })
  approve(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<BillingRunDetail> {
    return this.billingService.approve(user, id);
  }

  @Get("runs/:id/export")
  @RequireCapabilities("billing:write")
  @ApiOkResponse({ description: "Accounting export payload" })
  export(@Param("id", ParseIntPipe) id: number): Promise<BillingExportPayload> {
    return this.billingService.export(id);
  }
}

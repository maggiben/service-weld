import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import type {
  ArcaSimulationMode,
  BillingExportPayload,
  BillingRunDetail,
  Invoice,
} from "@weld/schemas";
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

  @Get("invoices/:id")
  @RequireCapabilities("billing:read")
  @ApiOkResponse({ description: "Invoice with charge lines and ARCA fields" })
  getInvoice(@Param("id", ParseIntPipe) id: number): Promise<Invoice> {
    return this.billingService.getInvoice(id);
  }

  @Post("invoices/:id/approve")
  @RequireCapabilities("billing:approve")
  @ApiOkResponse({ description: "Approve a single draft invoice" })
  approveInvoice(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<Invoice> {
    return this.billingService.approveInvoice(user, id);
  }

  @Post("invoices/:id/authorize")
  @RequireCapabilities("billing:write")
  @ApiOkResponse({ description: "Authorize invoice with ARCA (CAE)" })
  authorize(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<Invoice> {
    return this.billingService.authorizeWithArca(user, id);
  }

  @Post("invoices/:id/issue")
  @RequireCapabilities("billing:approve", "billing:write")
  @ApiOkResponse({
    description: "Approve draft if needed and authorize with ARCA",
  })
  issue(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<Invoice> {
    return this.billingService.approveAndAuthorize(user, id);
  }

  @Get("simulation-mode")
  @RequireCapabilities("billing:read")
  @ApiOkResponse({
    description: "Whether ARCA simulation mode is enabled (dev reset UI)",
  })
  getSimulationMode(): Promise<ArcaSimulationMode> {
    return this.billingService.getSimulationMode();
  }

  @Post("invoices/:id/reset-simulation")
  @RequireCapabilities("billing:approve", "billing:write")
  @ApiOkResponse({
    description:
      "Issue Nota de Crédito B when CAE exists, then clear CAE and return invoice to DRAFT (ARCA simulation mode only)",
  })
  resetSimulation(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<Invoice> {
    return this.billingService.resetSimulationInvoice(user, id);
  }

  @Get("invoices/:id/pdf")
  @RequireCapabilities("billing:read")
  @ApiProduces("application/pdf")
  @ApiOkResponse({ description: "Fiscal invoice PDF with CAE + QR" })
  @Header("Content-Type", "application/pdf")
  async printPdf(
    @Param("id", ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.billingService.printInvoicePdf(id);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  }
}

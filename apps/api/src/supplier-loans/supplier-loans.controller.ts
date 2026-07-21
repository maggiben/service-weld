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
import type { SupplierLoan } from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  AdvanceSupplierLoanDto,
  CreateSupplierLoanDto,
  SupplierLoanListQueryDto,
  SupplierLoanListResponseDto,
} from "./dto/supplier-loans.dto";
import { SupplierLoansService } from "./supplier-loans.service";

@ApiTags("SupplierLoans")
@ApiBearerAuth()
@Controller("supplier-loans")
export class SupplierLoansController {
  constructor(private readonly supplierLoansService: SupplierLoansService) {}

  @Get()
  @RequireCapabilities("supplier_loans:read")
  @ApiOkResponse({ type: SupplierLoanListResponseDto })
  list(@Query() query: SupplierLoanListQueryDto) {
    return this.supplierLoansService.list(query);
  }

  @Post()
  @RequireCapabilities("supplier_loans:write")
  @ApiCreatedResponse({ description: "Supplier loan cycle started" })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateSupplierLoanDto,
  ): Promise<SupplierLoan> {
    return this.supplierLoansService.create(user, body);
  }

  @Get(":id")
  @RequireCapabilities("supplier_loans:read")
  @ApiOkResponse({ description: "Supplier loan detail" })
  getById(@Param("id", ParseIntPipe) id: number): Promise<SupplierLoan> {
    return this.supplierLoansService.getById(id);
  }

  @Patch(":id/advance")
  @RequireCapabilities("supplier_loans:write")
  @ApiOkResponse({ description: "Loan stage advanced" })
  advance(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: AdvanceSupplierLoanDto,
    @Headers("if-match") ifMatch?: string,
  ): Promise<SupplierLoan> {
    const version = ifMatch ? Number(ifMatch.replaceAll('"', "")) : undefined;
    return this.supplierLoansService.advance(
      user,
      id,
      body,
      Number.isFinite(version) ? version : undefined,
    );
  }
}

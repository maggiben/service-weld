import { createZodDto } from "nestjs-zod";
import {
  AdvanceSupplierLoanInput,
  CreateSupplierLoanInput,
  SupplierLoanListQuery,
  SupplierLoanListResponse,
} from "@weld/schemas";

export class CreateSupplierLoanDto extends createZodDto(
  CreateSupplierLoanInput,
) {}
export class AdvanceSupplierLoanDto extends createZodDto(
  AdvanceSupplierLoanInput,
) {}
export class SupplierLoanListQueryDto extends createZodDto(
  SupplierLoanListQuery,
) {}
export class SupplierLoanListResponseDto extends createZodDto(
  SupplierLoanListResponse,
) {}

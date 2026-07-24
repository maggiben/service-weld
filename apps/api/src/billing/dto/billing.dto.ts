import { createZodDto } from "nestjs-zod";
import {
  CreateBillingRunInput,
  PeriodInvoicesQuery,
  SetInvoiceChargeLinesInput,
} from "@weld/schemas";

export class CreateBillingRunDto extends createZodDto(CreateBillingRunInput) {}
export class PeriodInvoicesQueryDto extends createZodDto(PeriodInvoicesQuery) {}
export class SetInvoiceChargeLinesDto extends createZodDto(
  SetInvoiceChargeLinesInput,
) {}

import { createZodDto } from "nestjs-zod";
import { CreateBillingRunInput } from "@weld/schemas";

export class CreateBillingRunDto extends createZodDto(CreateBillingRunInput) {}

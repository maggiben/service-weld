import { createZodDto } from "nestjs-zod";
import {
  CreateRentalRateInput,
  RentalRateListQuery,
  RentalRateListResponse,
  UpdateRentalRateInput,
} from "@weld/schemas";

export class CreateRentalRateDto extends createZodDto(CreateRentalRateInput) {}
export class UpdateRentalRateDto extends createZodDto(UpdateRentalRateInput) {}
export class RentalRateListQueryDto extends createZodDto(RentalRateListQuery) {}
export class RentalRateListResponseDto extends createZodDto(
  RentalRateListResponse,
) {}

import { createZodDto } from "nestjs-zod";
import {
  AccessoryListQuery,
  AccessoryListResponse,
  AccessoryRentalListQuery,
  AccessoryRentalListResponse,
  CreateAccessoryInput,
  CreateAccessoryRentalInput,
  ReturnAccessoryRentalInput,
  UpdateAccessoryInput,
} from "@weld/schemas";

export class CreateAccessoryDto extends createZodDto(CreateAccessoryInput) {}
export class UpdateAccessoryDto extends createZodDto(UpdateAccessoryInput) {}
export class AccessoryListQueryDto extends createZodDto(AccessoryListQuery) {}
export class AccessoryListResponseDto extends createZodDto(
  AccessoryListResponse,
) {}
export class CreateAccessoryRentalDto extends createZodDto(
  CreateAccessoryRentalInput,
) {}
export class ReturnAccessoryRentalDto extends createZodDto(
  ReturnAccessoryRentalInput,
) {}
export class AccessoryRentalListQueryDto extends createZodDto(
  AccessoryRentalListQuery,
) {}
export class AccessoryRentalListResponseDto extends createZodDto(
  AccessoryRentalListResponse,
) {}

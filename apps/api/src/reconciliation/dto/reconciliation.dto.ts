import { createZodDto } from "nestjs-zod";
import {
  OutstandingListQuery,
  OutstandingListResponse,
  PhysicalCountInput,
  PhysicalCountResult,
} from "@weld/schemas";

export class OutstandingListQueryDto extends createZodDto(
  OutstandingListQuery,
) {}
export class OutstandingListResponseDto extends createZodDto(
  OutstandingListResponse,
) {}
export class PhysicalCountInputDto extends createZodDto(PhysicalCountInput) {}
export class PhysicalCountResultDto extends createZodDto(PhysicalCountResult) {}

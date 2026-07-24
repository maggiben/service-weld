import { createZodDto } from "nestjs-zod";
import {
  CreateDeliveryNoteInput,
  DeliveryNoteListQuery,
  DeliveryNoteListResponse,
} from "@weld/schemas";

export class CreateDeliveryNoteDto extends createZodDto(
  CreateDeliveryNoteInput,
) {}
export class DeliveryNoteListQueryDto extends createZodDto(
  DeliveryNoteListQuery,
) {}
export class DeliveryNoteListResponseDto extends createZodDto(
  DeliveryNoteListResponse,
) {}

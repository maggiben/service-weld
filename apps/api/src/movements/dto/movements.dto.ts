import { createZodDto } from "nestjs-zod";
import {
  CreateMovementInput,
  MovementListQuery,
  MovementListResponse,
  ReturnMovementInput,
  SwapMovementInput,
  VoidMovementInput,
} from "@weld/schemas";

export class CreateMovementDto extends createZodDto(CreateMovementInput) {}
export class ReturnMovementDto extends createZodDto(ReturnMovementInput) {}
export class SwapMovementDto extends createZodDto(SwapMovementInput) {}
export class VoidMovementDto extends createZodDto(VoidMovementInput) {}
export class MovementListQueryDto extends createZodDto(MovementListQuery) {}
export class MovementListResponseDto extends createZodDto(
  MovementListResponse,
) {}

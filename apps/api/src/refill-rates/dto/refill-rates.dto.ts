import { createZodDto } from "nestjs-zod";
import type { z as Zod } from "zod";
import {
  CreateRefillRateInput,
  RefillRateListQuery,
  RefillRateListResponse,
  UpdateRefillRateInput,
} from "@weld/schemas";

/**
 * nestjs-zod OpenAPI crashes with `_zod in undefined` when createZodDto
 * receives a missing schema (stale @weld/schemas dist). Fail fast instead.
 */
function requireZodDto<TSchema extends Zod.ZodTypeAny>(
  schema: TSchema | undefined,
  exportName: string,
) {
  if (!schema) {
    throw new Error(
      `Missing ${exportName} from @weld/schemas — run: pnpm --filter @weld/schemas build`,
    );
  }
  return createZodDto(schema);
}

export class CreateRefillRateDto extends requireZodDto(
  CreateRefillRateInput,
  "CreateRefillRateInput",
) {}
export class UpdateRefillRateDto extends requireZodDto(
  UpdateRefillRateInput,
  "UpdateRefillRateInput",
) {}
export class RefillRateListQueryDto extends requireZodDto(
  RefillRateListQuery,
  "RefillRateListQuery",
) {}
export class RefillRateListResponseDto extends requireZodDto(
  RefillRateListResponse,
  "RefillRateListResponse",
) {}

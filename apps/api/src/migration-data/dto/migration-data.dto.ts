import { createZodDto } from "nestjs-zod";
import {
  MigrationMarkGoodRequest,
  MigrationRollbackRequest,
  MigrationRunRequest,
} from "@weld/schemas";

export class MigrationRunRequestDto extends createZodDto(MigrationRunRequest) {}
export class MigrationRollbackRequestDto extends createZodDto(
  MigrationRollbackRequest,
) {}
export class MigrationMarkGoodRequestDto extends createZodDto(
  MigrationMarkGoodRequest,
) {}

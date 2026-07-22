import { createZodDto } from "nestjs-zod";
import {
  MigrationMarkGoodRequest,
  MigrationPurgeBusinessRequest,
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
export class MigrationPurgeBusinessRequestDto extends createZodDto(
  MigrationPurgeBusinessRequest,
) {}

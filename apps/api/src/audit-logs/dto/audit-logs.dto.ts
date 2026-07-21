import { createZodDto } from "nestjs-zod";
import { AuditLogListQuery, AuditLogListResponse } from "@weld/schemas";

export class AuditLogListQueryDto extends createZodDto(AuditLogListQuery) {}
export class AuditLogListResponseDto extends createZodDto(
  AuditLogListResponse,
) {}

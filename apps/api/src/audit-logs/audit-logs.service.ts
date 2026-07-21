import { Injectable } from "@nestjs/common";
import type { AuditLogListQuery } from "@weld/schemas";
import { AuditLogsRepository } from "./audit-logs.repository";

@Injectable()
export class AuditLogsService {
  constructor(private readonly repository: AuditLogsRepository) {}

  list(query: AuditLogListQuery) {
    return this.repository.list(query);
  }
}

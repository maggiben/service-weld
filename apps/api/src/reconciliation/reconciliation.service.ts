import { Injectable } from "@nestjs/common";
import { assertPlausibleBusinessDate } from "@weld/domain";
import type {
  OutstandingListQuery,
  PhysicalCountInput,
  PhysicalCountResult,
} from "@weld/schemas";
import { mapDomainError } from "../common/errors/map-domain-error";
import { ReconciliationRepository } from "./reconciliation.repository";

@Injectable()
export class ReconciliationService {
  constructor(private readonly repository: ReconciliationRepository) {}

  listOutstanding(query: OutstandingListQuery) {
    return this.repository.listOutstanding(query);
  }

  runPhysicalCount(input: PhysicalCountInput): Promise<PhysicalCountResult> {
    try {
      assertPlausibleBusinessDate(input.counted_on);
    } catch (error) {
      mapDomainError(error);
    }
    return this.repository.runPhysicalCount(input);
  }
}

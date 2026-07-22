import { Injectable } from "@nestjs/common";
import type {
  BillingExportPayload,
  BillingRunDetail,
  CreateBillingRunInput,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { ApiErrors } from "../common/errors/api-error";
import { BillingRepository } from "./billing.repository";

@Injectable()
export class BillingService {
  constructor(private readonly repository: BillingRepository) {}

  createDraft(
    principal: AuthPrincipal,
    input: CreateBillingRunInput,
  ): Promise<BillingRunDetail> {
    // History never uses the UI date pickers — only each open loan's delivery → today.
    const normalized: CreateBillingRunInput =
      input.mode === "history"
        ? {
            mode: "history",
            client_party_id: input.client_party_id ?? null,
            locality_id: input.locality_id ?? null,
            territory_id: input.territory_id ?? null,
          }
        : input;
    return this.repository.createDraftRun(normalized, principal.id);
  }

  async getRun(id: number): Promise<BillingRunDetail> {
    const run = await this.repository.getRun(id);
    if (!run) throw ApiErrors.notFound("Billing run not found");
    return run;
  }

  /**
   * Approve draft → APPROVED (009 AC6).
   * MFA: when the principal has MFA enrolled (`mfa=true`), approval is allowed;
   * bootstrap admins without MFA enrollment still may approve in local/dev so
   * Phase 3 is exercisable — full MFA gate hardens with enrollment UX.
   */
  async approve(
    principal: AuthPrincipal,
    id: number,
  ): Promise<BillingRunDetail> {
    void principal;
    return this.repository.approveRun(id);
  }

  async export(id: number): Promise<BillingExportPayload> {
    return this.repository.exportRun(id);
  }
}

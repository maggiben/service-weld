import { forwardRef, Inject, Injectable } from "@nestjs/common";
import type {
  BackfillRefillRatesInput,
  BackfillRefillRatesResult,
  CreateRefillRateInput,
  RefillRate,
  RefillRateListQuery,
  UpdateRefillRateInput,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { BillingService } from "../billing/billing.service";
import { ApiErrors } from "../common/errors/api-error";
import { RefillRatesRepository } from "./refill-rates.repository";

@Injectable()
export class RefillRatesService {
  constructor(
    private readonly repository: RefillRatesRepository,
    @Inject(forwardRef(() => BillingService))
    private readonly billingService: BillingService,
  ) {}

  list(query: RefillRateListQuery) {
    return this.repository.list(query);
  }

  async create(input: CreateRefillRateInput): Promise<RefillRate> {
    this.assertDateRange(input.effective_from, input.effective_to ?? null);
    return this.repository.create(input);
  }

  async update(id: number, input: UpdateRefillRateInput): Promise<RefillRate> {
    const existing = await this.repository.getById(id);
    const effectiveFrom = input.effective_from ?? existing.effective_from;
    const effectiveTo =
      input.effective_to !== undefined
        ? input.effective_to
        : existing.effective_to;
    this.assertDateRange(effectiveFrom, effectiveTo);
    return this.repository.update(id, input);
  }

  /**
   * Regenerate a history billing draft so open REFILL movements reprice
   * against current refill_rate rows (014 R10). Unlike rental backfill,
   * there are no client daily defaults to fill (D-19).
   */
  async backfill(
    principal: AuthPrincipal,
    input: BackfillRefillRatesInput,
  ): Promise<BackfillRefillRatesResult> {
    if (input.rate_id != null) {
      await this.repository.getById(input.rate_id);
    }

    const run = await this.billingService.createDraft(principal, {
      mode: "history",
    });

    const lineCount = run.invoices.reduce(
      (sum, invoice) => sum + (invoice.charge_lines?.length ?? 0),
      0,
    );

    return {
      billing_run_id: run.id,
      invoice_count: run.invoice_count ?? run.invoices.length,
      line_count: lineCount,
      skipped_no_rate: run.skipped_no_rate ?? 0,
      total: run.total ?? 0,
    };
  }

  private assertDateRange(
    effectiveFrom: string,
    effectiveTo: string | null,
  ): void {
    if (effectiveTo != null && effectiveTo < effectiveFrom) {
      throw ApiErrors.validationFailed("effective_to before effective_from", [
        { field: "effective_to", issue: "Must be on or after effective_from" },
      ]);
    }
  }
}

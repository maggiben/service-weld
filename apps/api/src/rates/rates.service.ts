import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { dailyUnitPrice } from "@weld/domain";
import type {
  BackfillRentalRatesInput,
  BackfillRentalRatesResult,
  CreateRentalRateInput,
  RentalRate,
  RentalRateListQuery,
  UpdateRentalRateInput,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { BillingService } from "../billing/billing.service";
import { ApiErrors } from "../common/errors/api-error";
import { RatesRepository } from "./rates.repository";

@Injectable()
export class RatesService {
  constructor(
    private readonly repository: RatesRepository,
    @Inject(forwardRef(() => BillingService))
    private readonly billingService: BillingService,
  ) {}

  list(query: RentalRateListQuery) {
    return this.repository.list(query);
  }

  async create(input: CreateRentalRateInput): Promise<RentalRate> {
    this.assertDateRange(input.effective_from, input.effective_to ?? null);
    return this.repository.create(input);
  }

  async update(id: number, input: UpdateRentalRateInput): Promise<RentalRate> {
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
   * Fill/raise client daily defaults from a general rate (optional), then
   * regenerate a history billing draft so open rentals reprice.
   */
  async backfill(
    principal: AuthPrincipal,
    input: BackfillRentalRatesInput,
  ): Promise<BackfillRentalRatesResult> {
    let defaultsFilled = 0;
    let defaultsIncreased = 0;
    let clientPartyId: number | null = null;

    if (input.rate_id != null) {
      const rate = await this.repository.getById(input.rate_id);
      clientPartyId = rate.client_party_id;
      // Client defaults are a single number — only apply from wildcard rates.
      if (rate.gas_code == null && rate.capacity_m3 == null) {
        const defaults = await this.repository.backfillDailyDefaults({
          clientPartyId,
          dailyAmount: dailyUnitPrice({
            id: rate.id,
            client_party_id: rate.client_party_id,
            gas_code: rate.gas_code,
            capacity_m3: rate.capacity_m3,
            capacity_unit: rate.capacity_unit,
            period: rate.period,
            amount: rate.amount,
            effective_from: rate.effective_from,
            effective_to: rate.effective_to,
          }).amount,
        });
        defaultsFilled = defaults.filled;
        defaultsIncreased = defaults.increased;
      }
    } else {
      // Page-level: use the latest general global rate for default fill.
      const candidates = await this.repository.listAllCandidates();
      const general = [...candidates]
        .filter(
          (rate) =>
            rate.client_party_id == null &&
            rate.gas_code == null &&
            rate.capacity_m3 == null,
        )
        .sort((left, right) =>
          right.effective_from.localeCompare(left.effective_from),
        )[0];
      if (general) {
        const defaults = await this.repository.backfillDailyDefaults({
          clientPartyId: null,
          dailyAmount: dailyUnitPrice(general).amount,
        });
        defaultsFilled = defaults.filled;
        defaultsIncreased = defaults.increased;
      }
    }

    const run = await this.billingService.createDraft(principal, {
      mode: "history",
      client_party_id: clientPartyId,
    });

    const lineCount = run.invoices.reduce(
      (sum, invoice) => sum + (invoice.charge_lines?.length ?? 0),
      0,
    );

    return {
      defaults_filled: defaultsFilled,
      defaults_increased: defaultsIncreased,
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

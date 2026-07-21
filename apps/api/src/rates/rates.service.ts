import { Injectable } from "@nestjs/common";
import type {
  CreateRentalRateInput,
  RentalRate,
  RentalRateListQuery,
  UpdateRentalRateInput,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import { RatesRepository } from "./rates.repository";

@Injectable()
export class RatesService {
  constructor(private readonly repository: RatesRepository) {}

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

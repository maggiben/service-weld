import { Injectable } from "@nestjs/common";
import {
  assertDistinctTransferParties,
  assertPlausibleBusinessDate,
  isTerminalCylinderState,
} from "@weld/domain";
import type {
  CreateStockTransferInput,
  StockTransfer,
  StockTransferListQuery,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { ApiErrors } from "../common/errors/api-error";
import { mapDomainError } from "../common/errors/map-domain-error";
import { TransfersRepository } from "./transfers.repository";

@Injectable()
export class TransfersService {
  constructor(private readonly repository: TransfersRepository) {}

  list(query: StockTransferListQuery) {
    return this.repository.list(query);
  }

  async getById(id: number): Promise<StockTransfer> {
    const transfer = await this.repository.getById(id);
    if (!transfer) throw ApiErrors.notFound("Transfer not found");
    return transfer;
  }

  async create(
    principal: AuthPrincipal,
    input: CreateStockTransferInput,
  ): Promise<StockTransfer> {
    try {
      assertPlausibleBusinessDate(input.transfer_date);
      assertDistinctTransferParties(input.from_party_id, input.to_party_id);
    } catch (error) {
      mapDomainError(error);
    }

    const cylinder = await this.repository.getCylinder(input.cylinder_id);
    if (!cylinder) throw ApiErrors.notFound("Cylinder not found");
    if (isTerminalCylinderState(cylinder.state)) {
      throw ApiErrors.cylinderTerminal();
    }

    const fromParty = await this.repository.getParty(input.from_party_id);
    if (!fromParty) {
      throw ApiErrors.validationFailed("Unknown origin party", [
        { field: "from_party_id", issue: "Party not found" },
      ]);
    }
    const toParty = await this.repository.getParty(input.to_party_id);
    if (!toParty) {
      throw ApiErrors.validationFailed("Unknown destination party", [
        { field: "to_party_id", issue: "Party not found" },
      ]);
    }

    return this.repository.create(input, principal.id);
  }
}

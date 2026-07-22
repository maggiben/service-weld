import { Injectable } from "@nestjs/common";
import {
  assertDistinctTransferParties,
  assertPlausibleBusinessDate,
  assertTransferReturnOrder,
  isTerminalCylinderState,
} from "@weld/domain";
import type {
  CloseStockTransferInput,
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
      if (input.return_date) {
        assertPlausibleBusinessDate(input.return_date);
      }
      assertTransferReturnOrder(input.transfer_date, input.return_date);
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

  async close(
    id: number,
    input: CloseStockTransferInput,
  ): Promise<StockTransfer> {
    const existing = await this.repository.getById(id);
    if (!existing) throw ApiErrors.notFound("Transfer not found");
    if (existing.return_date != null) {
      throw ApiErrors.conflict(
        "ALREADY_CLOSED",
        "Transfer already has an entry date",
      );
    }

    try {
      assertPlausibleBusinessDate(input.return_date);
      assertTransferReturnOrder(existing.transfer_date, input.return_date);
    } catch (error) {
      mapDomainError(error);
    }

    const closed = await this.repository.close(id, input.return_date);
    if (!closed) throw ApiErrors.notFound("Transfer not found");
    return closed;
  }
}

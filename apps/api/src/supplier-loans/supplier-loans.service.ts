import { Injectable } from "@nestjs/common";
import {
  assertLoanDateOrder,
  assertLoanStageAdvance,
  assertPlausibleBusinessDate,
  isTerminalCylinderState,
  previousDateForAdvance,
} from "@weld/domain";
import type {
  AdvanceSupplierLoanInput,
  CreateSupplierLoanInput,
  SupplierLoan,
  SupplierLoanListQuery,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { ApiErrors } from "../common/errors/api-error";
import { mapDomainError } from "../common/errors/map-domain-error";
import { SupplierLoansRepository } from "./supplier-loans.repository";

@Injectable()
export class SupplierLoansService {
  constructor(private readonly repository: SupplierLoansRepository) {}

  list(query: SupplierLoanListQuery) {
    return this.repository.list(query);
  }

  async getById(id: number): Promise<SupplierLoan> {
    const loan = await this.repository.getById(id);
    if (!loan) throw ApiErrors.notFound("Supplier loan not found");
    return loan;
  }

  async create(
    _principal: AuthPrincipal,
    input: CreateSupplierLoanInput,
  ): Promise<SupplierLoan> {
    try {
      assertPlausibleBusinessDate(input.received_from_supplier);
    } catch (error) {
      mapDomainError(error);
    }

    const partyType = await this.repository.getPartyType(
      input.supplier_party_id,
    );
    if (partyType !== "SUPPLIER") {
      throw ApiErrors.validationFailed("Supplier party required", [
        {
          field: "supplier_party_id",
          issue: "Party must be of type SUPPLIER",
        },
      ]);
    }

    const cylinder = await this.repository.getCylinder(input.cylinder_id);
    if (!cylinder) throw ApiErrors.notFound("Cylinder not found");
    if (isTerminalCylinderState(cylinder.state)) {
      throw ApiErrors.cylinderTerminal();
    }

    return this.repository.create({
      ...input,
      gas_code:
        input.gas_code ??
        (cylinder.gas_code as CreateSupplierLoanInput["gas_code"]),
    });
  }

  async advance(
    _principal: AuthPrincipal,
    id: number,
    input: AdvanceSupplierLoanInput,
    ifMatchVersion?: number,
  ): Promise<SupplierLoan> {
    const loan = await this.getById(id);

    try {
      assertPlausibleBusinessDate(input.date);
      assertLoanStageAdvance(loan.stage, input.stage);
      assertLoanDateOrder(previousDateForAdvance(loan.stage, loan), input.date);
    } catch (error) {
      mapDomainError(error);
    }

    if (input.stage === "OUT_TO_CLIENT") {
      if (input.client_party_id == null) {
        throw ApiErrors.validationFailed("Client required", [
          {
            field: "client_party_id",
            issue: "Required when advancing to OUT_TO_CLIENT",
          },
        ]);
      }
      const exists = await this.repository.clientExists(input.client_party_id);
      if (!exists) {
        throw ApiErrors.validationFailed("Unknown client", [
          { field: "client_party_id", issue: "Client not found" },
        ]);
      }
    }

    const expectedVersion = ifMatchVersion ?? loan.version;
    if (expectedVersion !== loan.version) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Loan version conflict");
    }

    return this.repository.advance(id, input, expectedVersion);
  }
}

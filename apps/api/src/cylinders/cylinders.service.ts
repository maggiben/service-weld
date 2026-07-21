import { Injectable } from "@nestjs/common";
import {
  assertCanReportLoss,
  assertNotPackedMember,
  assertOwnerBasisConsistency,
  assertPlausibleBusinessDate,
  assertReplaceable,
  Capacity,
  stateAfterLoss,
  type PartyType,
} from "@weld/domain";
import type {
  CreateCylinderInput,
  CreateMovementInput,
  Cylinder,
  CylinderHistoryQuery,
  CylinderListQuery,
  ReplaceCylinderInput,
  ReplaceCylinderResponse,
  ReportCylinderLossInput,
  ReportCylinderLossResponse,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { ApiErrors } from "../common/errors/api-error";
import { mapDomainError } from "../common/errors/map-domain-error";
import { MovementsRepository } from "../movements/movements.repository";
import { CylindersRepository } from "./cylinders.repository";

@Injectable()
export class CylindersService {
  constructor(
    private readonly repository: CylindersRepository,
    private readonly movementsRepository: MovementsRepository,
  ) {}

  list(query: CylinderListQuery) {
    return this.repository.list(query);
  }

  async getById(id: number): Promise<Cylinder> {
    const cylinder = await this.repository.getById(id);
    if (!cylinder) throw ApiErrors.notFound("Cylinder not found");
    return cylinder;
  }

  async getHistory(id: number, query: CylinderHistoryQuery) {
    const history = await this.repository.listHistory(id, query);
    if (!history) throw ApiErrors.notFound("Cylinder not found");
    return history;
  }

  async create(
    principal: AuthPrincipal,
    input: CreateCylinderInput,
  ): Promise<Cylinder> {
    const partyType = await this.repository.getOwnerPartyType(
      input.owner_party_id,
    );
    if (!partyType) {
      throw ApiErrors.validationFailed("Unknown owner_party_id", [
        { field: "owner_party_id", issue: "Party not found" },
      ]);
    }

    try {
      assertOwnerBasisConsistency(
        partyType as PartyType,
        input.ownership_basis,
      );
      if (input.capacity_m3 != null) {
        Capacity.of(input.capacity_m3);
      }
    } catch (error) {
      mapDomainError(error);
    }

    if (input.gas_code) {
      const exists = await this.repository.gasExists(input.gas_code);
      if (!exists) {
        throw ApiErrors.validationFailed("Unknown gas code", [
          { field: "gas_code", issue: "UNKNOWN_GAS" },
        ]);
      }
    }

    return this.repository.create(input, principal.id);
  }

  async reportLoss(
    principal: AuthPrincipal,
    id: number,
    input: ReportCylinderLossInput,
    ifMatchVersion?: number,
  ): Promise<ReportCylinderLossResponse> {
    const cylinder = await this.repository.getById(id);
    if (!cylinder) throw ApiErrors.notFound("Cylinder not found");

    try {
      assertCanReportLoss(cylinder.state, input.outcome);
      assertPlausibleBusinessDate(input.occurred_on);
    } catch (error) {
      mapDomainError(error);
    }

    // client_party_id is accepted for charge-back proposals (Phase 3); validate if present.
    if (input.client_party_id != null) {
      const partyType = await this.repository.getOwnerPartyType(
        input.client_party_id,
      );
      if (!partyType) {
        throw ApiErrors.validationFailed("Unknown client_party_id", [
          { field: "client_party_id", issue: "Party not found" },
        ]);
      }
    }

    const expectedVersion = ifMatchVersion ?? cylinder.version;
    const raiseSupplierAlert = cylinder.ownership_basis === "SUPPLIER";

    // Domain transition check already ran; keep outcome typing aligned.
    void stateAfterLoss(input.outcome);

    const result = await this.repository.reportLoss({
      cylinderId: id,
      outcome: input.outcome,
      occurredOn: input.occurred_on,
      note: input.note ?? null,
      expectedVersion,
      actorUserId: principal.id,
      raiseSupplierAlert,
    });

    return {
      cylinder: result.cylinder,
      alert: result.alert
        ? {
            id: Number(result.alert.id),
            alert_type: result.alert.alert_type,
            entity_table: result.alert.entity_table,
            entity_id:
              result.alert.entity_id == null
                ? null
                : Number(result.alert.entity_id),
            severity: Number(result.alert.severity),
            created_at: result.alert.created_at.toISOString(),
            resolved_at: result.alert.resolved_at
              ? result.alert.resolved_at.toISOString()
              : null,
            assigned_role: result.alert.assigned_role,
          }
        : null,
    };
  }

  async replace(
    principal: AuthPrincipal,
    originalId: number,
    input: ReplaceCylinderInput,
    ifMatchVersion?: number,
  ): Promise<ReplaceCylinderResponse> {
    const original = await this.repository.getById(originalId);
    if (!original) throw ApiErrors.notFound("Cylinder not found");

    const replacement = await this.repository.getById(
      input.replacement_cylinder_id,
    );
    if (!replacement)
      throw ApiErrors.notFound("Replacement cylinder not found");

    try {
      assertReplaceable({
        originalState: original.state,
        replacementState: replacement.state,
      });
      assertNotPackedMember(replacement.packaging);
      assertPlausibleBusinessDate(input.occurred_on);
    } catch (error) {
      mapDomainError(error);
    }

    if (await this.movementsRepository.hasOpenMovement(replacement.id)) {
      throw ApiErrors.replacementNotAvailable();
    }

    const expectedVersion = ifMatchVersion ?? original.version;
    if (expectedVersion !== original.version) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Cylinder version conflict");
    }

    // Close any open movement on the original as LOST (being replaced).
    const openId =
      await this.movementsRepository.findOpenIdByCylinder(originalId);
    if (openId != null) {
      await this.repository.reportLoss({
        cylinderId: originalId,
        outcome: "LOST",
        occurredOn: input.occurred_on,
        note: input.note ?? `Reemplazado por ${replacement.serial_number}`,
        expectedVersion: original.version,
        actorUserId: principal.id,
        raiseSupplierAlert: false,
      });
    } else if (
      original.state !== "LOST" &&
      original.state !== "BROKEN" &&
      original.state !== "SOLD"
    ) {
      await this.repository.updateState(
        originalId,
        "RETIRED",
        "EMPTY",
        principal.id,
      );
    }

    const delivery: CreateMovementInput = {
      cylinder_id: replacement.id,
      holder_party_id: input.client_party_id,
      movement_kind:
        replacement.ownership_basis === "CUSTOMER" ? "REFILL" : "RENTAL",
      gas_code: replacement.gas_code,
      delivery_date: input.occurred_on,
      note:
        input.note ??
        `En reemplazo de ${original.serial_number} (#${original.id})`,
    };

    const movement = await this.movementsRepository.createDelivery(
      delivery,
      replacement.ownership_basis,
      replacement.gas_code,
      principal.id,
    );

    const updatedOriginal = await this.repository.getById(originalId);
    if (!updatedOriginal) throw ApiErrors.notFound("Original not found");

    return {
      original: updatedOriginal,
      replacement_movement: {
        id: movement.id,
        cylinder_id: movement.cylinder_id,
        holder_party_id: movement.holder_party_id,
        state: movement.state,
      },
    };
  }
}

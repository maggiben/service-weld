import { Injectable } from "@nestjs/common";
import {
  assertDeliverable,
  assertKindBasisConsistency,
  assertNotPackedMember,
  assertPlausibleBusinessDate,
  assertSellable,
  RentalPeriod,
} from "@weld/domain";
import type {
  CreateMovementInput,
  MovementEvent,
  MovementListQuery,
  RecordSalePriceInput,
  ReturnMovementInput,
  SwapMovementInput,
  VoidMovementInput,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { BillingLookupService } from "../billing/billing.module";
import { ApiErrors } from "../common/errors/api-error";
import { mapDomainError } from "../common/errors/map-domain-error";
import { MovementsRepository } from "./movements.repository";

@Injectable()
export class MovementsService {
  constructor(
    private readonly repository: MovementsRepository,
    private readonly billingLookup: BillingLookupService,
  ) {}

  list(query: MovementListQuery) {
    return this.repository.list(query);
  }

  async getById(id: number): Promise<MovementEvent> {
    const movement = await this.repository.getById(id);
    if (!movement) throw ApiErrors.notFound("Movement not found");
    return movement;
  }

  async create(
    principal: AuthPrincipal,
    input: CreateMovementInput,
  ): Promise<MovementEvent> {
    const cylinder = await this.repository.getCylinderForDelivery(
      input.cylinder_id,
    );
    if (!cylinder) {
      throw ApiErrors.notFound("Cylinder not found");
    }

    const holderOk = await this.repository.holderExists(input.holder_party_id);
    if (!holderOk) {
      throw ApiErrors.validationFailed("Unknown holder_party_id", [
        { field: "holder_party_id", issue: "Party not found" },
      ]);
    }

    if (input.origin_party_id != null) {
      const originOk = await this.repository.holderExists(
        input.origin_party_id,
      );
      if (!originOk) {
        throw ApiErrors.validationFailed("Unknown origin_party_id", [
          { field: "origin_party_id", issue: "Party not found" },
        ]);
      }
    }

    if (await this.repository.hasOpenMovement(cylinder.id)) {
      throw ApiErrors.cylinderAlreadyOut();
    }

    const isSale = input.movement_kind === "SALE";

    try {
      assertNotPackedMember(cylinder.packaging);
      if (isSale) {
        assertSellable(cylinder.state);
      } else {
        assertDeliverable(cylinder.state, {
          forRefill: input.movement_kind === "REFILL",
        });
      }
      assertKindBasisConsistency(input.movement_kind, cylinder.ownership_basis);
      assertPlausibleBusinessDate(input.delivery_date);
    } catch (error) {
      mapDomainError(error);
    }

    const gasCode = input.gas_code ?? cylinder.gas_code;

    try {
      return isSale
        ? await this.repository.createSale(
            input,
            cylinder,
            gasCode,
            principal.id,
          )
        : await this.repository.createDelivery(
            input,
            cylinder.ownership_basis,
            gasCode,
            principal.id,
          );
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw ApiErrors.cylinderAlreadyOut();
      }
      throw error;
    }
  }

  async returnMovement(
    principal: AuthPrincipal,
    id: number,
    input: ReturnMovementInput,
    ifMatchVersion?: number,
  ): Promise<MovementEvent> {
    const movement = await this.repository.getById(id);
    if (!movement) throw ApiErrors.notFound("Movement not found");

    if (movement.state !== "OPEN") {
      throw ApiErrors.notOpen();
    }

    try {
      assertPlausibleBusinessDate(input.return_date);
      RentalPeriod.between(movement.delivery_date, input.return_date);
    } catch (error) {
      mapDomainError(error);
    }

    const expectedVersion = ifMatchVersion ?? movement.version;

    // Customer-owned / REFILL: close the fill cycle without returning to our stock.
    if (
      movement.property_basis === "CUSTOMER" ||
      movement.movement_kind === "REFILL"
    ) {
      return this.repository.closeRefill(
        id,
        movement.cylinder_id,
        input.return_date,
        expectedVersion,
        principal.id,
      );
    }

    return this.repository.closeReturn(
      id,
      movement.cylinder_id,
      input.return_date,
      expectedVersion,
      principal.id,
    );
  }

  async swap(
    principal: AuthPrincipal,
    id: number,
    input: SwapMovementInput,
    ifMatchVersion?: number,
  ): Promise<MovementEvent> {
    const movement = await this.repository.getById(id);
    if (!movement) throw ApiErrors.notFound("Movement not found");

    if (movement.state !== "OPEN") {
      throw ApiErrors.notOpen();
    }

    if (input.returned_cylinder_id === movement.cylinder_id) {
      throw ApiErrors.validationFailed(
        "Replacement cylinder must differ from the one being returned",
        [
          {
            field: "returned_cylinder_id",
            issue: "Must differ from delivered cylinder",
          },
        ],
      );
    }

    const replacement = await this.repository.getCylinderForDelivery(
      input.returned_cylinder_id,
    );
    if (!replacement) {
      throw ApiErrors.notFound("Replacement cylinder not found");
    }

    if (await this.repository.hasOpenMovement(input.returned_cylinder_id)) {
      throw ApiErrors.returnedCylinderBusy();
    }

    try {
      assertNotPackedMember(replacement.packaging);
      assertDeliverable(replacement.state, {
        forRefill: movement.movement_kind === "REFILL",
      });
      assertKindBasisConsistency(
        movement.movement_kind,
        replacement.ownership_basis,
      );
      assertPlausibleBusinessDate(input.return_date);
      RentalPeriod.between(movement.delivery_date, input.return_date);
    } catch (error) {
      mapDomainError(error);
    }

    const expectedVersion = ifMatchVersion ?? movement.version;
    const gasCode = replacement.gas_code ?? movement.gas_code;

    try {
      return await this.repository.swapReturn({
        movementId: id,
        deliveredCylinderId: movement.cylinder_id,
        replacementCylinderId: input.returned_cylinder_id,
        holderPartyId: movement.holder_party_id,
        movementKind: movement.movement_kind,
        propertyBasis: replacement.ownership_basis,
        gasCode,
        swapDate: input.return_date,
        expectedVersion,
        actorUserId: principal.id,
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw ApiErrors.cylinderAlreadyOut();
      }
      throw error;
    }
  }

  async void(
    principal: AuthPrincipal,
    id: number,
    input: VoidMovementInput,
    ifMatchVersion?: number,
  ): Promise<MovementEvent> {
    const movement = await this.repository.getById(id);
    if (!movement) throw ApiErrors.notFound("Movement not found");

    if (movement.state === "VOID") {
      throw ApiErrors.conflict("ALREADY_VOID", "Movement is already VOID");
    }

    if (await this.billingLookup.movementHasLockedCharges(id)) {
      throw ApiErrors.conflict(
        "ALREADY_BILLED",
        "Movement is on an approved/exported invoice",
      );
    }

    const restoreSold =
      movement.movement_kind === "SALE" && movement.state === "SOLD";
    if (
      restoreSold &&
      (await this.billingLookup.cylinderSaleHasLockedCharges(
        movement.cylinder_id,
      ))
    ) {
      throw ApiErrors.conflict(
        "ALREADY_BILLED",
        "Cylinder sale is on an approved/exported invoice",
      );
    }

    const expectedVersion = ifMatchVersion ?? movement.version;

    return this.repository.voidMovement(
      id,
      movement.cylinder_id,
      movement.state === "OPEN",
      input.reason,
      expectedVersion,
      principal.id,
      { restoreSold },
    );
  }

  findOpenIdByCylinder(cylinderId: number): Promise<number | null> {
    return this.repository.findOpenIdByCylinder(cylinderId);
  }

  async recordSalePrice(
    principal: AuthPrincipal,
    id: number,
    input: RecordSalePriceInput,
  ): Promise<MovementEvent> {
    const movement = await this.repository.getById(id);
    if (!movement) throw ApiErrors.notFound("Movement not found");
    if (movement.movement_kind !== "SALE" || movement.state !== "SOLD") {
      throw ApiErrors.validationFailed("Not a sold SALE movement", [
        { field: "id", issue: "Must be a SOLD sale movement" },
      ]);
    }
    if (
      await this.billingLookup.cylinderSaleHasLockedCharges(
        movement.cylinder_id,
      )
    ) {
      throw ApiErrors.conflict(
        "ALREADY_BILLED",
        "Cylinder sale is on an approved/exported invoice",
      );
    }
    return this.repository.recordSalePrice(
      id,
      movement,
      input.sale_price,
      principal.id,
    );
  }
}

function isExclusionViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23P01"
  );
}

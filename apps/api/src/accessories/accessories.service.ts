import { Injectable } from "@nestjs/common";
import {
  assertAccessoryOnLoan,
  assertAccessoryRentable,
  assertPlausibleBusinessDate,
  calendarDaysBetween,
} from "@weld/domain";
import type {
  Accessory,
  AccessoryListQuery,
  AccessoryRental,
  AccessoryRentalListQuery,
  CreateAccessoryInput,
  CreateAccessoryRentalInput,
  ReturnAccessoryRentalInput,
  UpdateAccessoryInput,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { ApiErrors } from "../common/errors/api-error";
import { mapDomainError } from "../common/errors/map-domain-error";
import { AccessoriesRepository } from "./accessories.repository";

@Injectable()
export class AccessoriesService {
  constructor(private readonly repository: AccessoriesRepository) {}

  listAccessories(query: AccessoryListQuery) {
    return this.repository.listAccessories(query);
  }

  async getAccessory(id: number): Promise<Accessory> {
    const accessory = await this.repository.getAccessory(id);
    if (!accessory) throw ApiErrors.notFound("Accessory not found");
    return accessory;
  }

  async createAccessory(
    principal: AuthPrincipal,
    input: CreateAccessoryInput,
  ): Promise<Accessory> {
    try {
      return await this.repository.createAccessory(input, principal.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "DUPLICATE_ACCESSORY",
          "Accessory identifier already exists for this type",
        );
      }
      throw error;
    }
  }

  async updateAccessory(
    principal: AuthPrincipal,
    id: number,
    input: UpdateAccessoryInput,
    ifMatchVersion?: number,
  ): Promise<Accessory> {
    const accessory = await this.getAccessory(id);
    const expected = ifMatchVersion ?? accessory.version;
    if (expected !== accessory.version) {
      throw ApiErrors.conflict(
        "VERSION_CONFLICT",
        "Accessory version conflict",
      );
    }
    return this.repository.updateAccessory(id, input, principal.id, expected);
  }

  listRentals(query: AccessoryRentalListQuery) {
    return this.repository.listRentals(query);
  }

  async createRental(
    principal: AuthPrincipal,
    input: CreateAccessoryRentalInput,
  ): Promise<AccessoryRental> {
    try {
      assertPlausibleBusinessDate(input.start_date);
    } catch (error) {
      mapDomainError(error);
    }

    const accessory = await this.getAccessory(input.accessory_id);
    try {
      assertAccessoryRentable(accessory.state);
    } catch (error) {
      mapDomainError(error);
    }

    const clientOk = await this.repository.clientExists(input.client_party_id);
    if (!clientOk) {
      throw ApiErrors.validationFailed("Unknown client", [
        { field: "client_party_id", issue: "Client not found" },
      ]);
    }

    try {
      return await this.repository.createRental(input, principal.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "ACCESSORY_ALREADY_ON_LOAN",
          "Accessory already has an open loan",
        );
      }
      throw error;
    }
  }

  async returnRental(
    principal: AuthPrincipal,
    id: number,
    input: ReturnAccessoryRentalInput,
    ifMatchVersion?: number,
  ): Promise<AccessoryRental> {
    const rental = await this.repository.getRental(id);
    if (!rental) throw ApiErrors.notFound("Rental not found");

    try {
      assertPlausibleBusinessDate(input.end_date);
    } catch (error) {
      mapDomainError(error);
    }
    if (calendarDaysBetween(rental.start_date, input.end_date) < 0) {
      throw ApiErrors.validationFailed("Bad date", [
        { field: "end_date", issue: "end_date must be on or after start_date" },
      ]);
    }

    const accessory = await this.getAccessory(rental.accessory_id);
    try {
      assertAccessoryOnLoan(accessory.state);
    } catch (error) {
      mapDomainError(error);
    }

    if (rental.state !== "ON_LOAN") {
      throw ApiErrors.conflict(
        "NOT_ON_LOAN",
        "Accessory rental is not ON_LOAN",
      );
    }

    const expected = ifMatchVersion ?? rental.version;
    if (expected !== rental.version) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Rental version conflict");
    }

    return this.repository.returnRental(id, input, expected, principal.id);
  }

  findOpenRentalIdByAccessory(accessoryId: number): Promise<number | null> {
    return this.repository.findOpenRentalIdByAccessory(accessoryId);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

import { Injectable } from "@nestjs/common";
import {
  assertBatteryMemberCount,
  assertPackableAsBatteryMember,
} from "@weld/domain";
import type {
  AddBatteryMemberInput,
  Battery,
  BatteryListQuery,
  CreateBatteryInput,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { ApiErrors } from "../common/errors/api-error";
import { mapDomainError } from "../common/errors/map-domain-error";
import { BatteriesRepository } from "./batteries.repository";

@Injectable()
export class BatteriesService {
  constructor(private readonly repository: BatteriesRepository) {}

  list(query: BatteryListQuery) {
    return this.repository.list(query);
  }

  async getById(id: number): Promise<Battery> {
    const battery = await this.repository.getById(id);
    if (!battery) throw ApiErrors.notFound("Battery not found");
    return battery;
  }

  async create(
    principal: AuthPrincipal,
    input: CreateBatteryInput,
  ): Promise<Battery> {
    try {
      assertBatteryMemberCount(input.member_cylinder_ids.length);
    } catch (error) {
      mapDomainError(error);
    }

    const uniqueIds = [...new Set(input.member_cylinder_ids)];
    if (uniqueIds.length !== input.member_cylinder_ids.length) {
      throw ApiErrors.validationFailed("Duplicate member ids", [
        { field: "member_cylinder_ids", issue: "Duplicates not allowed" },
      ]);
    }

    for (const cylinderId of uniqueIds) {
      const cyl = await this.repository.getCylinderPackInfo(cylinderId);
      if (!cyl) {
        throw ApiErrors.validationFailed("Unknown cylinder", [
          {
            field: "member_cylinder_ids",
            issue: `Cylinder ${cylinderId} not found`,
          },
        ]);
      }
      try {
        assertPackableAsBatteryMember({
          packaging: cyl.packaging,
          batteryId: cyl.battery_id,
          state: cyl.state,
          ownerPartyId: cyl.owner_party_id,
          batteryOwnerPartyId: input.owner_party_id,
        });
      } catch (error) {
        mapDomainError(error);
      }
    }

    try {
      return await this.repository.create(input, principal.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiErrors.conflict(
          "DUPLICATE_BATTERY_CODE",
          "Battery code already exists for this owner",
        );
      }
      throw error;
    }
  }

  async addMember(
    principal: AuthPrincipal,
    batteryId: number,
    input: AddBatteryMemberInput,
  ): Promise<Battery> {
    const battery = await this.getById(batteryId);
    const cyl = await this.repository.getCylinderPackInfo(input.cylinder_id);
    if (!cyl) throw ApiErrors.notFound("Cylinder not found");

    try {
      assertPackableAsBatteryMember({
        packaging: cyl.packaging,
        batteryId: cyl.battery_id,
        state: cyl.state,
        ownerPartyId: cyl.owner_party_id,
        batteryOwnerPartyId: battery.owner_party_id,
      });
    } catch (error) {
      mapDomainError(error);
    }

    return this.repository.addMember(
      batteryId,
      input.cylinder_id,
      principal.id,
    );
  }

  async removeMember(
    principal: AuthPrincipal,
    batteryId: number,
    cylinderId: number,
  ): Promise<Battery> {
    const battery = await this.getById(batteryId);
    const activeCount = battery.members?.length ?? battery.member_count ?? 0;
    try {
      assertBatteryMemberCount(activeCount - 1);
    } catch (error) {
      mapDomainError(error);
    }
    return this.repository.removeMember(batteryId, cylinderId, principal.id);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

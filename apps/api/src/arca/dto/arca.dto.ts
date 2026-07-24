import { createZodDto } from "nestjs-zod";
import {
  ArcaEnvironmentQuery,
  DeleteArcaCertificateInput,
  GenerateArcaKeysInput,
  UpdateArcaCompanyProfileInput,
  UpdateArcaSimulationModeInput,
  UpdateArcaTestingModeInput,
} from "@weld/schemas";

export class ArcaEnvironmentQueryDto extends createZodDto(
  ArcaEnvironmentQuery,
) {}
export class GenerateArcaKeysDto extends createZodDto(GenerateArcaKeysInput) {}
export class DeleteArcaCertificateDto extends createZodDto(
  DeleteArcaCertificateInput,
) {}
export class UpdateArcaTestingModeDto extends createZodDto(
  UpdateArcaTestingModeInput,
) {}
export class UpdateArcaCompanyProfileDto extends createZodDto(
  UpdateArcaCompanyProfileInput,
) {}
export class UpdateArcaSimulationModeDto extends createZodDto(
  UpdateArcaSimulationModeInput,
) {}

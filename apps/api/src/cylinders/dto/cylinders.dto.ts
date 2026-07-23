import { createZodDto } from "nestjs-zod";
import {
  CreateCylinderInput,
  CylinderHistoryQuery,
  CylinderHistoryResponse,
  CylinderListQuery,
  CylinderListResponse,
  ReplaceCylinderInput,
  ReportCylinderLossInput,
  UpdateCylinderInput,
} from "@weld/schemas";

export class CreateCylinderDto extends createZodDto(CreateCylinderInput) {}
export class UpdateCylinderDto extends createZodDto(UpdateCylinderInput) {}
export class CylinderListQueryDto extends createZodDto(CylinderListQuery) {}
export class CylinderListResponseDto extends createZodDto(
  CylinderListResponse,
) {}
export class CylinderHistoryQueryDto extends createZodDto(
  CylinderHistoryQuery,
) {}
export class CylinderHistoryResponseDto extends createZodDto(
  CylinderHistoryResponse,
) {}
export class ReportCylinderLossDto extends createZodDto(
  ReportCylinderLossInput,
) {}
export class ReplaceCylinderDto extends createZodDto(ReplaceCylinderInput) {}

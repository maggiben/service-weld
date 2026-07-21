import { createZodDto } from "nestjs-zod";
import {
  CreateLocalityInput,
  CreateTerritoryInput,
  LocalityListQuery,
  LocalityListResponse,
  TerritoryListQuery,
  TerritoryListResponse,
} from "@weld/schemas";

export class CreateTerritoryDto extends createZodDto(CreateTerritoryInput) {}
export class TerritoryListQueryDto extends createZodDto(TerritoryListQuery) {}
export class TerritoryListResponseDto extends createZodDto(
  TerritoryListResponse,
) {}

export class CreateLocalityDto extends createZodDto(CreateLocalityInput) {}
export class LocalityListQueryDto extends createZodDto(LocalityListQuery) {}
export class LocalityListResponseDto extends createZodDto(
  LocalityListResponse,
) {}

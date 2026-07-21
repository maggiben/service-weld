import { Injectable } from "@nestjs/common";
import type {
  CreateLocalityInput,
  CreateTerritoryInput,
  Locality,
  LocalityListQuery,
  LocalityListResponse,
  Territory,
  TerritoryListQuery,
  TerritoryListResponse,
} from "@weld/schemas";
import { MastersRepository } from "./masters.repository";

@Injectable()
export class MastersService {
  constructor(private readonly repo: MastersRepository) {}

  listTerritories(query: TerritoryListQuery): Promise<TerritoryListResponse> {
    return this.repo.listTerritories(query);
  }

  createTerritory(input: CreateTerritoryInput): Promise<Territory> {
    return this.repo.createTerritory(input);
  }

  listLocalities(query: LocalityListQuery): Promise<LocalityListResponse> {
    return this.repo.listLocalities(query);
  }

  createLocality(input: CreateLocalityInput): Promise<Locality> {
    return this.repo.createLocality(input);
  }
}

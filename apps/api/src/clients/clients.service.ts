import { Injectable } from "@nestjs/common";
import type {
  Client,
  ClientAccountQuery,
  ClientAccountResponse,
  ClientListQuery,
  CreateClientInput,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { territoryIdsForPrincipal } from "../auth/principal";
import { ApiErrors } from "../common/errors/api-error";
import { ClientsRepository } from "./clients.repository";

@Injectable()
export class ClientsService {
  constructor(private readonly repository: ClientsRepository) {}

  list(principal: AuthPrincipal, query: ClientListQuery) {
    return this.repository.list({
      query,
      territoryIds: territoryIdsForPrincipal(principal),
      roles: principal.roles,
    });
  }

  async getById(principal: AuthPrincipal, id: number): Promise<Client> {
    const client = await this.repository.getById({
      id,
      territoryIds: territoryIdsForPrincipal(principal),
      roles: principal.roles,
    });
    if (!client) {
      throw ApiErrors.notFound("Client not found");
    }
    return client;
  }

  async getAccount(
    principal: AuthPrincipal,
    id: number,
    query: ClientAccountQuery,
  ): Promise<ClientAccountResponse> {
    const account = await this.repository.getAccount({
      id,
      query,
      territoryIds: territoryIdsForPrincipal(principal),
      roles: principal.roles,
    });
    if (!account) {
      throw ApiErrors.notFound("Client not found");
    }
    return account;
  }

  create(principal: AuthPrincipal, input: CreateClientInput): Promise<Client> {
    return this.repository.create(input, principal.id);
  }
}

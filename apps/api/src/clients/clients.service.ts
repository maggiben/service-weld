import { Injectable } from "@nestjs/common";
import type {
  Client,
  ClientAccountQuery,
  ClientAccountResponse,
  ClientListQuery,
  CreateClientInput,
  UpdateClientInput,
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

  async update(
    principal: AuthPrincipal,
    id: number,
    input: UpdateClientInput,
    ifMatchVersion?: number,
  ): Promise<Client> {
    const client = await this.getById(principal, id);

    if (input.daily_rate_default !== undefined) {
      const canEditRate =
        principal.roles.includes("ADMIN") ||
        principal.roles.includes("BILLING") ||
        principal.capabilities.includes("rates:write");
      if (!canEditRate) {
        throw ApiErrors.forbidden(
          "Billing or admin role required to change daily rate",
        );
      }
    }

    const expected = ifMatchVersion ?? client.version;
    if (expected !== client.version) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Client version conflict");
    }

    return this.repository.update(id, input, principal.id, expected);
  }

  async remove(
    principal: AuthPrincipal,
    id: number,
    ifMatchVersion?: number,
  ): Promise<void> {
    if (!principal.roles.includes("ADMIN")) {
      throw ApiErrors.forbidden("Admin role required to delete a client");
    }

    const client = await this.getById(principal, id);
    const expected = ifMatchVersion ?? client.version;
    if (expected !== client.version) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Client version conflict");
    }

    await this.repository.softDelete(id, principal.id, expected);
  }
}

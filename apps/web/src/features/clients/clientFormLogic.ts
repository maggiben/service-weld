import type { Client, CreateClientInput } from "@weld/schemas";
import { clientCustodyLabel, formatLedgerDate } from "./clientLedgerLogic";

export { clientCustodyLabel, formatLedgerDate };

export type CreateClientInputType = CreateClientInput;

export function toClientFormValues(
  client: Client | null | undefined,
  defaultTerritoryId: number,
): CreateClientInput {
  if (!client) {
    return {
      name: "",
      cuit: null,
      address_street: null,
      locality_id: null,
      territory_id: defaultTerritoryId,
      coverage: "PRIVATE",
      segment: null,
      delivery_instructions: null,
      contacts: [{ name: "", phone: "", is_primary: true }],
    };
  }

  const contacts =
    client.contacts?.map((contact) => ({
      name: contact.name ?? "",
      phone: contact.phone ?? "",
      role: contact.role ?? null,
      is_primary: contact.is_primary,
    })) ?? [];

  return {
    name: client.name,
    cuit: client.cuit,
    address_street: client.address_street,
    locality_id: client.locality_id,
    territory_id: client.territory_id,
    coverage: client.coverage,
    segment: client.segment,
    delivery_instructions: client.delivery_instructions,
    contacts:
      contacts.length > 0
        ? contacts
        : [{ name: "", phone: "", is_primary: true }],
  };
}

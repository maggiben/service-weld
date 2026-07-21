import { z } from "zod";
import { IsoDate, PageMeta, paginated, PaginationQuery } from "./common";
import { Cuit, isValidCuit } from "./cuit";
import {
  ClientCoverage,
  ClientSegment,
  ClientStatus,
  GasCode,
  MovementKind,
} from "./enums";
import { MovementEvent } from "./movement";

const CUIT_FORMAT = /^\d{2}-\d{8}-\d$/;

export const ClientContact = z.object({
  id: z.number().int().optional(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  is_primary: z.boolean().default(false),
});
export type ClientContact = z.infer<typeof ClientContact>;

export const Client = z.object({
  id: z.number().int(),
  name: z.string(),
  cuit: z.string().nullable(),
  cuit_valid: z.boolean(),
  address_street: z.string().nullable(),
  locality_id: z.number().int().nullable(),
  territory_id: z.number().int(),
  coverage: ClientCoverage,
  segment: ClientSegment.nullable(),
  delivery_instructions: z.string().nullable(),
  daily_rate_default: z.number().nullable(),
  status: ClientStatus,
  version: z.number().int(),
  created_at: z.string().datetime(),
  contacts: z.array(ClientContact).optional(),
  outstanding_count: z.number().int().optional(),
  open_accessory_count: z.number().int().optional(),
});
export type Client = z.infer<typeof Client>;

export const CreateClientContactInput = ClientContact.omit({ id: true });

const optionalCuit = z
  .string()
  .regex(CUIT_FORMAT, { message: "CUIT must match NN-NNNNNNNN-N" })
  .nullable()
  .optional()
  .refine((value) => value == null || isValidCuit(value), {
    message: "Invalid CUIT check digit",
  });

export const CreateClientInput = z
  .object({
    name: z.string().min(1),
    cuit: optionalCuit,
    address_street: z.string().nullable().optional(),
    locality_id: z.number().int().nullable().optional(),
    territory_id: z.number().int(),
    coverage: ClientCoverage.default("PRIVATE"),
    segment: ClientSegment.nullable().optional(),
    delivery_instructions: z.string().nullable().optional(),
    daily_rate_default: z.coerce
      .number()
      .multipleOf(0.01)
      .nullable()
      .optional(),
    contacts: z.array(CreateClientContactInput).default([]),
  })
  .refine(
    (value) =>
      value.contacts.filter((contact) => contact.is_primary).length <= 1,
    { message: "At most one primary contact is allowed", path: ["contacts"] },
  );
export type CreateClientInput = z.infer<typeof CreateClientInput>;

export const UpdateClientInput = z
  .object({
    name: z.string().min(1).optional(),
    cuit: optionalCuit,
    address_street: z.string().nullable().optional(),
    locality_id: z.number().int().nullable().optional(),
    territory_id: z.number().int().optional(),
    coverage: ClientCoverage.optional(),
    segment: ClientSegment.nullable().optional(),
    delivery_instructions: z.string().nullable().optional(),
    daily_rate_default: z.coerce
      .number()
      .multipleOf(0.01)
      .nullable()
      .optional(),
    status: ClientStatus.optional(),
    contacts: z.array(CreateClientContactInput).optional(),
  })
  .refine(
    (value) =>
      value.contacts == null ||
      value.contacts.filter((contact) => contact.is_primary).length <= 1,
    { message: "At most one primary contact is allowed", path: ["contacts"] },
  );
export type UpdateClientInput = z.infer<typeof UpdateClientInput>;

export const ClientListQuery = PaginationQuery.extend({
  q: z.string().optional(),
  sort: z
    .enum([
      "name",
      "-name",
      "created_at",
      "-created_at",
      "territory_id",
      "-territory_id",
    ])
    .default("name"),
  has_outstanding: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  "filter[territory_id]": z.coerce.number().int().optional(),
  "filter[locality_id]": z.coerce.number().int().optional(),
  "filter[coverage]": ClientCoverage.optional(),
  "filter[segment]": ClientSegment.optional(),
  "filter[status]": ClientStatus.optional(),
});
export type ClientListQuery = z.infer<typeof ClientListQuery>;

export const ClientListResponse = paginated(Client);
export type ClientListResponse = z.infer<typeof ClientListResponse>;

/** Open movement on a client account (GET /clients/{id}/account). */
export const ClientAccountOutstandingRow = z.object({
  movement_id: z.number().int(),
  cylinder_id: z.number().int(),
  serial: z.string(),
  gas_code: GasCode.nullable(),
  movement_kind: MovementKind,
  delivery_date: IsoDate,
  accrued_days: z.number().int(),
});
export type ClientAccountOutstandingRow = z.infer<
  typeof ClientAccountOutstandingRow
>;

export const ClientAccountGasCount = z.object({
  gas_code: GasCode.nullable(),
  count: z.number().int(),
});
export type ClientAccountGasCount = z.infer<typeof ClientAccountGasCount>;

export const ClientAccountSummary = z.object({
  open_count: z.number().int(),
  open_rental_count: z.number().int(),
  open_refill_count: z.number().int(),
  closed_days_last_period: z.number().int(),
  by_gas: z.array(ClientAccountGasCount),
});
export type ClientAccountSummary = z.infer<typeof ClientAccountSummary>;

export const ClientAccountQuery = PaginationQuery.extend({
  sort: z.enum(["delivery_date", "-delivery_date"]).default("-delivery_date"),
  open: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  "filter[kind]": MovementKind.optional(),
  "filter[delivery_date][gte]": IsoDate.optional(),
  "filter[delivery_date][lte]": IsoDate.optional(),
});
export type ClientAccountQuery = z.infer<typeof ClientAccountQuery>;

export const ClientAccountResponse = z.object({
  client_id: z.number().int(),
  outstanding: z.array(ClientAccountOutstandingRow),
  rental_summary: ClientAccountSummary,
  data: z.array(MovementEvent),
  page: PageMeta,
});
export type ClientAccountResponse = z.infer<typeof ClientAccountResponse>;

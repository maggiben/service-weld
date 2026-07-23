import { z as zod } from "zod";
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

export const ClientContact = zod.object({
  id: zod.number().int().optional(),
  name: zod.string().nullable().optional(),
  phone: zod.string().nullable().optional(),
  role: zod.string().nullable().optional(),
  is_primary: zod.boolean().default(false),
});
export type ClientContact = zod.infer<typeof ClientContact>;

export const Client = zod.object({
  id: zod.number().int(),
  name: zod.string(),
  cuit: zod.string().nullable(),
  cuit_valid: zod.boolean(),
  address_street: zod.string().nullable(),
  locality_id: zod.number().int().nullable(),
  territory_id: zod.number().int(),
  coverage: ClientCoverage,
  segment: ClientSegment.nullable(),
  delivery_instructions: zod.string().nullable(),
  daily_rate_default: zod.number().nullable(),
  status: ClientStatus,
  version: zod.number().int(),
  created_at: zod.string().datetime(),
  contacts: zod.array(ClientContact).optional(),
  outstanding_count: zod.number().int().optional(),
  open_accessory_count: zod.number().int().optional(),
});
export type Client = zod.infer<typeof Client>;

export const CreateClientContactInput = ClientContact.omit({ id: true });

const optionalCuit = zod
  .string()
  .regex(CUIT_FORMAT, { message: "CUIT must match NN-NNNNNNNN-N" })
  .nullable()
  .optional()
  .refine((value) => value == null || isValidCuit(value), {
    message: "Invalid CUIT check digit",
  });

export const CreateClientInput = zod
  .object({
    name: zod.string().min(1),
    cuit: optionalCuit,
    address_street: zod.string().nullable().optional(),
    locality_id: zod.number().int().nullable().optional(),
    territory_id: zod.number().int(),
    coverage: ClientCoverage.default("PRIVATE"),
    segment: ClientSegment.nullable().optional(),
    delivery_instructions: zod.string().nullable().optional(),
    daily_rate_default: zod.coerce
      .number()
      .multipleOf(0.01)
      .nullable()
      .optional(),
    contacts: zod.array(CreateClientContactInput).default([]),
  })
  .refine(
    (value) =>
      value.contacts.filter((contact) => contact.is_primary).length <= 1,
    { message: "At most one primary contact is allowed", path: ["contacts"] },
  );
export type CreateClientInput = zod.infer<typeof CreateClientInput>;

export const UpdateClientInput = zod
  .object({
    name: zod.string().min(1).optional(),
    cuit: optionalCuit,
    address_street: zod.string().nullable().optional(),
    locality_id: zod.number().int().nullable().optional(),
    territory_id: zod.number().int().optional(),
    coverage: ClientCoverage.optional(),
    segment: ClientSegment.nullable().optional(),
    delivery_instructions: zod.string().nullable().optional(),
    daily_rate_default: zod.coerce
      .number()
      .multipleOf(0.01)
      .nullable()
      .optional(),
    status: ClientStatus.optional(),
    contacts: zod.array(CreateClientContactInput).optional(),
  })
  .refine(
    (value) =>
      value.contacts == null ||
      value.contacts.filter((contact) => contact.is_primary).length <= 1,
    { message: "At most one primary contact is allowed", path: ["contacts"] },
  );
export type UpdateClientInput = zod.infer<typeof UpdateClientInput>;

export const ClientListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
  sort: zod
    .enum([
      "name",
      "-name",
      "created_at",
      "-created_at",
      "territory_id",
      "-territory_id",
      "outstanding_count",
      "-outstanding_count",
    ])
    .default("name"),
  has_outstanding: zod
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  "filter[territory_id]": zod.coerce.number().int().optional(),
  "filter[locality_id]": zod.coerce.number().int().optional(),
  "filter[coverage]": ClientCoverage.optional(),
  "filter[segment]": ClientSegment.optional(),
  "filter[status]": ClientStatus.optional(),
});
export type ClientListQuery = zod.infer<typeof ClientListQuery>;

export const ClientListResponse = paginated(Client);
export type ClientListResponse = zod.infer<typeof ClientListResponse>;

/** Open movement on a client account (GET /clients/{id}/account). */
export const ClientAccountOutstandingRow = zod.object({
  movement_id: zod.number().int(),
  cylinder_id: zod.number().int(),
  serial: zod.string(),
  gas_code: GasCode.nullable(),
  movement_kind: MovementKind,
  delivery_date: IsoDate,
  accrued_days: zod.number().int(),
});
export type ClientAccountOutstandingRow = zod.infer<
  typeof ClientAccountOutstandingRow
>;

export const ClientAccountGasCount = zod.object({
  gas_code: GasCode.nullable(),
  count: zod.number().int(),
});
export type ClientAccountGasCount = zod.infer<typeof ClientAccountGasCount>;

export const ClientAccountSummary = zod.object({
  open_count: zod.number().int(),
  open_rental_count: zod.number().int(),
  open_refill_count: zod.number().int(),
  closed_days_last_period: zod.number().int(),
  by_gas: zod.array(ClientAccountGasCount),
});
export type ClientAccountSummary = zod.infer<typeof ClientAccountSummary>;

export const ClientAccountQuery = PaginationQuery.extend({
  sort: zod.enum(["delivery_date", "-delivery_date"]).default("-delivery_date"),
  open: zod
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  "filter[kind]": MovementKind.optional(),
  "filter[delivery_date][gte]": IsoDate.optional(),
  "filter[delivery_date][lte]": IsoDate.optional(),
});
export type ClientAccountQuery = zod.infer<typeof ClientAccountQuery>;

export const ClientAccountResponse = zod.object({
  client_id: zod.number().int(),
  outstanding: zod.array(ClientAccountOutstandingRow),
  rental_summary: ClientAccountSummary,
  data: zod.array(MovementEvent),
  page: PageMeta,
});
export type ClientAccountResponse = zod.infer<typeof ClientAccountResponse>;

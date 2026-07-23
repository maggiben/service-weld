import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { GasCode, LoanStage } from "./enums";

export const SupplierLoan = zod.object({
  id: zod.number().int(),
  cylinder_id: zod.number().int(),
  cylinder_serial: zod.string().optional(),
  supplier_party_id: zod.number().int(),
  supplier_name: zod.string().optional(),
  client_party_id: zod.number().int().nullable(),
  client_name: zod.string().nullable().optional(),
  gas_code: GasCode.nullable(),
  received_from_supplier: IsoDate.nullable(),
  delivered_to_client: IsoDate.nullable(),
  returned_by_client: IsoDate.nullable(),
  returned_to_supplier: IsoDate.nullable(),
  stage: LoanStage,
  version: zod.number().int(),
  overdue: zod.boolean().optional(),
});
export type SupplierLoan = zod.infer<typeof SupplierLoan>;

export const CreateSupplierLoanInput = zod.object({
  cylinder_id: zod.number().int(),
  supplier_party_id: zod.number().int(),
  gas_code: GasCode.nullable().optional(),
  received_from_supplier: IsoDate,
});
export type CreateSupplierLoanInput = zod.infer<typeof CreateSupplierLoanInput>;

export const AdvanceSupplierLoanInput = zod.object({
  stage: zod.enum([
    "OUT_TO_CLIENT",
    "BACK_FROM_CLIENT",
    "RETURNED_TO_SUPPLIER",
  ]),
  date: IsoDate,
  client_party_id: zod.number().int().optional(),
});
export type AdvanceSupplierLoanInput = zod.infer<
  typeof AdvanceSupplierLoanInput
>;

export const SupplierLoanListQuery = PaginationQuery.extend({
  sort: zod
    .enum(["received_from_supplier", "-received_from_supplier"])
    .default("received_from_supplier"),
  "filter[supplier_party_id]": zod.coerce.number().int().optional(),
  "filter[stage]": LoanStage.optional(),
  open: zod
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  overdue: zod
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});
export type SupplierLoanListQuery = zod.infer<typeof SupplierLoanListQuery>;

export const SupplierLoanListResponse = paginated(SupplierLoan);
export type SupplierLoanListResponse = zod.infer<
  typeof SupplierLoanListResponse
>;

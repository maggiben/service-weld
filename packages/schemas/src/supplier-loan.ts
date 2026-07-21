import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { GasCode, LoanStage } from "./enums";

export const SupplierLoan = z.object({
  id: z.number().int(),
  cylinder_id: z.number().int(),
  cylinder_serial: z.string().optional(),
  supplier_party_id: z.number().int(),
  supplier_name: z.string().optional(),
  client_party_id: z.number().int().nullable(),
  client_name: z.string().nullable().optional(),
  gas_code: GasCode.nullable(),
  received_from_supplier: IsoDate.nullable(),
  delivered_to_client: IsoDate.nullable(),
  returned_by_client: IsoDate.nullable(),
  returned_to_supplier: IsoDate.nullable(),
  stage: LoanStage,
  version: z.number().int(),
  overdue: z.boolean().optional(),
});
export type SupplierLoan = z.infer<typeof SupplierLoan>;

export const CreateSupplierLoanInput = z.object({
  cylinder_id: z.number().int(),
  supplier_party_id: z.number().int(),
  gas_code: GasCode.nullable().optional(),
  received_from_supplier: IsoDate,
});
export type CreateSupplierLoanInput = z.infer<typeof CreateSupplierLoanInput>;

export const AdvanceSupplierLoanInput = z.object({
  stage: z.enum(["OUT_TO_CLIENT", "BACK_FROM_CLIENT", "RETURNED_TO_SUPPLIER"]),
  date: IsoDate,
  client_party_id: z.number().int().optional(),
});
export type AdvanceSupplierLoanInput = z.infer<typeof AdvanceSupplierLoanInput>;

export const SupplierLoanListQuery = PaginationQuery.extend({
  sort: z
    .enum(["received_from_supplier", "-received_from_supplier"])
    .default("received_from_supplier"),
  "filter[supplier_party_id]": z.coerce.number().int().optional(),
  "filter[stage]": LoanStage.optional(),
  open: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
export type SupplierLoanListQuery = z.infer<typeof SupplierLoanListQuery>;

export const SupplierLoanListResponse = paginated(SupplierLoan);
export type SupplierLoanListResponse = z.infer<typeof SupplierLoanListResponse>;

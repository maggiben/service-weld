import { z } from "zod";

/** Days after which an open supplier loan loop is overdue (US-21). */
export const SupplierLoanOverdueDays = z.number().int().min(1).max(3650);

export const SystemSettings = z.object({
  supplier_loan_overdue_days: SupplierLoanOverdueDays,
  version: z.number().int(),
});
export type SystemSettings = z.infer<typeof SystemSettings>;

export const UpdateSystemSettingsInput = z.object({
  supplier_loan_overdue_days: SupplierLoanOverdueDays,
});
export type UpdateSystemSettingsInput = z.infer<
  typeof UpdateSystemSettingsInput
>;

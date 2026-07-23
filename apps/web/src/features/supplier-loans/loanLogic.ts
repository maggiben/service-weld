import type { AdvanceSupplierLoanInput, LoanStage } from "@weld/schemas";
import { formatDateDMY } from "../../lib/dateFormat";

export const LOAN_STAGE_NEXT: Record<
  LoanStage,
  AdvanceSupplierLoanInput["stage"] | null
> = {
  RECEIVED: "OUT_TO_CLIENT",
  OUT_TO_CLIENT: "BACK_FROM_CLIENT",
  BACK_FROM_CLIENT: "RETURNED_TO_SUPPLIER",
  RETURNED_TO_SUPPLIER: null,
};

export function nextLoanStage(
  current: LoanStage,
): AdvanceSupplierLoanInput["stage"] | null {
  return LOAN_STAGE_NEXT[current];
}

export const formatLoanDate = formatDateDMY;

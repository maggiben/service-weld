import type { LoanStage } from "@weld/schemas";
import { DomainErrors } from "./errors";
import { calendarDaysBetween } from "./value-objects";

/** Days after which an open supplier loop is overdue (US-21). */
export const SUPPLIER_LOAN_OVERDUE_DAYS = 120;

const STAGE_ORDER: LoanStage[] = [
  "RECEIVED",
  "OUT_TO_CLIENT",
  "BACK_FROM_CLIENT",
  "RETURNED_TO_SUPPLIER",
];

const NEXT_STAGE: Record<LoanStage, LoanStage | null> = {
  RECEIVED: "OUT_TO_CLIENT",
  OUT_TO_CLIENT: "BACK_FROM_CLIENT",
  BACK_FROM_CLIENT: "RETURNED_TO_SUPPLIER",
  RETURNED_TO_SUPPLIER: null,
};

export function nextLoanStage(current: LoanStage): LoanStage | null {
  return NEXT_STAGE[current];
}

/** BR-11: stages advance forward-only. */
export function assertLoanStageAdvance(
  current: LoanStage,
  target: LoanStage,
): void {
  const expected = NEXT_STAGE[current];
  if (expected == null || target !== expected) {
    throw DomainErrors.stageOutOfOrder(current, target);
  }
}

/**
 * BR-11 / BR-04: loan dates are non-decreasing across stages.
 * `previousDate` is the date of the stage being left (or received on create).
 */
export function assertLoanDateOrder(
  previousDate: string | null,
  nextDate: string,
): void {
  if (previousDate == null) return;
  if (calendarDaysBetween(previousDate, nextDate) < 0) {
    throw DomainErrors.dateOrder();
  }
}

export function loanDateForStage(
  stage: LoanStage,
  dates: {
    received_from_supplier: string | null;
    delivered_to_client: string | null;
    returned_by_client: string | null;
    returned_to_supplier: string | null;
  },
): string | null {
  switch (stage) {
    case "RECEIVED":
      return dates.received_from_supplier;
    case "OUT_TO_CLIENT":
      return dates.delivered_to_client;
    case "BACK_FROM_CLIENT":
      return dates.returned_by_client;
    case "RETURNED_TO_SUPPLIER":
      return dates.returned_to_supplier;
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

/** Anchor date for ordering the next advance (current stage's date). */
export function previousDateForAdvance(
  current: LoanStage,
  dates: {
    received_from_supplier: string | null;
    delivered_to_client: string | null;
    returned_by_client: string | null;
    returned_to_supplier: string | null;
  },
): string | null {
  return loanDateForStage(current, dates);
}

export function isLoanOverdue(params: {
  stage: LoanStage;
  receivedFromSupplier: string | null;
  asOf: string;
  /** Defaults to {@link SUPPLIER_LOAN_OVERDUE_DAYS} when omitted. */
  overdueDays?: number;
}): boolean {
  if (params.stage === "RETURNED_TO_SUPPLIER") return false;
  if (!params.receivedFromSupplier) return false;
  const overdueDays = params.overdueDays ?? SUPPLIER_LOAN_OVERDUE_DAYS;
  return (
    calendarDaysBetween(params.receivedFromSupplier, params.asOf) >= overdueDays
  );
}

export function stageIndex(stage: LoanStage): number {
  return STAGE_ORDER.indexOf(stage);
}

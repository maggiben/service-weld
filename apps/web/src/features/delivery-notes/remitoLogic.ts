import { formatRemitoSeriesNumber } from "@weld/domain";
import type { RemitoSeries, RemitoStatus, RemitoType } from "@weld/schemas";
import type { ChipColor } from "../../lib/chipColors";

export type RemitoLifecycleAction =
  | "prepare"
  | "assign"
  | "load"
  | "dispatch"
  | "deliver"
  | "sign"
  | "close"
  | "cancel";

const ACTION_CAPABILITY: Record<RemitoLifecycleAction, string> = {
  prepare: "delivery_notes:prepare",
  assign: "delivery_notes:assign",
  load: "delivery_notes:load",
  dispatch: "delivery_notes:dispatch",
  deliver: "delivery_notes:deliver",
  sign: "delivery_notes:sign",
  close: "delivery_notes:close",
  cancel: "delivery_notes:cancel",
};

const ACTION_TARGET: Record<RemitoLifecycleAction, RemitoStatus> = {
  prepare: "PREPARED",
  assign: "ASSIGNED",
  load: "LOADED",
  dispatch: "IN_TRANSIT",
  deliver: "DELIVERED",
  sign: "SIGNED",
  close: "CLOSED",
  cancel: "CANCELLED",
};

/** Happy-path next action (excluding cancel). */
const PRIMARY_NEXT: Partial<Record<RemitoStatus, RemitoLifecycleAction>> = {
  DRAFT: "prepare",
  PREPARED: "assign",
  ASSIGNED: "load",
  LOADED: "dispatch",
  IN_TRANSIT: "deliver",
  DELIVERED: "sign",
  SIGNED: "close",
};

const SKIP_FLEET: ReadonlySet<RemitoType> = new Set([
  "CUSTOMER_PICKUP",
  "ADJUSTMENT",
  "INTERNAL_TRANSFER",
]);

export function remitoStatusChipColor(status: RemitoStatus): ChipColor {
  switch (status) {
    case "DRAFT":
      return "default";
    case "PREPARED":
    case "ASSIGNED":
    case "LOADED":
      return "info";
    case "IN_TRANSIT":
    case "DELIVERED":
      return "warning";
    case "SIGNED":
    case "CLOSED":
    case "INVOICED":
    case "ARCHIVED":
      return "success";
    case "CANCELLED":
      return "error";
    default:
      return "default";
  }
}

export function remitoPriorityChipColor(priority: string): ChipColor {
  if (priority === "URGENT") return "error";
  if (priority === "HIGH") return "warning";
  if (priority === "LOW") return "default";
  return "info";
}

export function capabilityForRemitoAction(
  action: RemitoLifecycleAction,
): string {
  return ACTION_CAPABILITY[action];
}

export function targetStatusForAction(
  action: RemitoLifecycleAction,
): RemitoStatus {
  return ACTION_TARGET[action];
}

export function primaryNextAction(
  status: RemitoStatus,
  remitoType: RemitoType,
): RemitoLifecycleAction | null {
  if (status === "PREPARED" && SKIP_FLEET.has(remitoType)) {
    return "deliver";
  }
  return PRIMARY_NEXT[status] ?? null;
}

export function canCancelRemito(status: RemitoStatus): boolean {
  return (
    status !== "CLOSED" &&
    status !== "INVOICED" &&
    status !== "ARCHIVED" &&
    status !== "CANCELLED"
  );
}

/** Soft-delete eligibility (hidden from list; not for billed/archived). */
export function canSoftDeleteRemito(status: RemitoStatus): boolean {
  return status !== "INVOICED" && status !== "ARCHIVED";
}

/** Preview the next series number for create forms (does not allocate). */
export function previewNextRemitoNumber(
  seriesList: RemitoSeries[] | undefined,
  preferredCode = "A",
): string | null {
  if (!seriesList?.length) return null;
  const series =
    seriesList.find((row) => row.code === preferredCode) ?? seriesList[0];
  if (!series) return null;
  return formatRemitoSeriesNumber(
    series.code,
    series.next_number,
    series.pad_width,
  );
}

export const REMITO_TYPES: RemitoType[] = [
  "DELIVERY",
  "CYLINDER_RETURN",
  "ACCESSORY_RETURN",
  "TRANSFER_WAREHOUSE",
  "INTERNAL_TRANSFER",
  "CUSTOMER_PICKUP",
  "ADJUSTMENT",
  "RENTAL_PICKUP",
  "RENTAL_DELIVERY",
];

export const REMITO_STATUSES: RemitoStatus[] = [
  "DRAFT",
  "PREPARED",
  "ASSIGNED",
  "LOADED",
  "IN_TRANSIT",
  "DELIVERED",
  "SIGNED",
  "CLOSED",
  "INVOICED",
  "ARCHIVED",
  "CANCELLED",
];

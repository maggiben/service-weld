/** Chip color mappers for status / severity displays. */

export type ChipColor =
  | "default"
  | "primary"
  | "secondary"
  | "error"
  | "info"
  | "success"
  | "warning";

export function alertSeverityColor(severity: number): ChipColor {
  if (severity >= 3) return "error";
  if (severity === 2) return "warning";
  return "info";
}

export function cylinderStateChipColor(
  state: string | null | undefined,
): ChipColor {
  switch (state) {
    case "SOLD":
      return "secondary";
    case "LOST":
    case "BROKEN":
      return "error";
    case "AT_CLIENT":
      return "warning";
    case "AT_SUPPLIER":
      return "info";
    case "IN_STOCK_EMPTY":
    case "IN_STOCK_FULL":
      return "success";
    default:
      return "default";
  }
}

export function transferCustodyChipColor(
  status: string,
): "warning" | "info" | "success" {
  if (status === "LOANED") return "warning";
  if (status === "REFILL") return "info";
  return "success";
}

export function movementStateChipColor(
  state: string,
  returned: boolean,
): ChipColor {
  if (returned) {
    switch (state) {
      case "SWAPPED":
        return "info";
      case "LOST":
        return "error";
      case "CLOSED":
        return "success";
      default:
        return "default";
    }
  }
  return state === "OPEN" ? "warning" : "default";
}

export function loanStageChipColor(
  stage: string,
): "default" | "info" | "warning" | "success" {
  if (stage === "OUT_TO_CLIENT") return "warning";
  if (stage === "BACK_FROM_CLIENT") return "info";
  if (stage === "RETURNED_TO_SUPPLIER") return "success";
  return "default";
}

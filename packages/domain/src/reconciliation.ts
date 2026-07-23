import type { CylinderState } from "@weld/schemas";

export type VarianceKind =
  "MATCHED" | "PRESENT_ELSEWHERE" | "ABSENT_HERE" | "UNKNOWN_SERIAL";

export type SuggestedAction = "NONE" | "LOSS" | "TRANSFER" | "VERIFY";

const IN_STOCK: ReadonlySet<CylinderState> = new Set([
  "IN_STOCK_EMPTY",
  "IN_STOCK_FULL",
]);

/**
 * Classify one counted serial against system custody (US-26 / AC6).
 * `system` is null when the serial is unknown to the registry.
 */
export function classifyPhysicalCountRow(params: {
  serial: string;
  system: { cylinderId: number; state: CylinderState } | null;
}): {
  kind: VarianceKind;
  cylinder_id: number | null;
  serial_number: string;
  system_state: string | null;
  suggested_action: SuggestedAction;
} {
  if (!params.system) {
    return {
      kind: "UNKNOWN_SERIAL",
      cylinder_id: null,
      serial_number: params.serial,
      system_state: null,
      suggested_action: "VERIFY",
    };
  }
  if (IN_STOCK.has(params.system.state)) {
    return {
      kind: "MATCHED",
      cylinder_id: params.system.cylinderId,
      serial_number: params.serial,
      system_state: params.system.state,
      suggested_action: "NONE",
    };
  }
  return {
    kind: "PRESENT_ELSEWHERE",
    cylinder_id: params.system.cylinderId,
    serial_number: params.serial,
    system_state: params.system.state,
    suggested_action: "TRANSFER",
  };
}

/**
 * System in-stock cylinders not present in a full plant count.
 * Only emit when `full_plant_count` is true — a partial list must not
 * treat every unscanned in-stock cylinder as a loss.
 */
export function absentHereRow(params: {
  cylinderId: number;
  serial: string;
  state: CylinderState;
}): {
  kind: "ABSENT_HERE";
  cylinder_id: number;
  serial_number: string;
  system_state: string;
  suggested_action: SuggestedAction;
} {
  return {
    kind: "ABSENT_HERE",
    cylinder_id: params.cylinderId,
    serial_number: params.serial,
    system_state: params.state,
    suggested_action: "LOSS",
  };
}

/** Legacy "REVISAR N°" / missing-serial notes → to-verify flag (US-25). */
export function isToVerifyNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return /revisar|illegib|sin\s*n[uú]mero|to\s*verify|missing\s*serial/i.test(
    note,
  );
}

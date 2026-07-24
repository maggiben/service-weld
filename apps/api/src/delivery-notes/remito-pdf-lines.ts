import type {
  DeliveryNoteDetail,
  DeliveryNoteLinkedMovement,
  DeliveryNoteLinkedRental,
  RemitoLine,
} from "@weld/schemas";

/**
 * PDF line source: prefer Aggregate `remito_line` rows.
 * Legacy remitos (created via movement remito_number find-or-create) often
 * have no lines — fall back to linked movements / accessory rentals.
 */
export function linesForRemitoPdf(
  detail: Pick<
    DeliveryNoteDetail,
    "id" | "lines" | "movements" | "accessory_rentals"
  >,
): RemitoLine[] {
  const lines = detail.lines ?? [];
  if (lines.length > 0) return lines;

  const fromMovements = detail.movements.map((movement, index) =>
    movementToPdfLine(detail.id, movement, index + 1),
  );
  const fromRentals = detail.accessory_rentals.map((rental, index) =>
    rentalToPdfLine(detail.id, rental, fromMovements.length + index + 1),
  );
  return [...fromMovements, ...fromRentals];
}

function movementToPdfLine(
  remitoId: number,
  movement: DeliveryNoteLinkedMovement,
  lineNo: number,
): RemitoLine {
  return {
    id: movement.id,
    remito_id: remitoId,
    line_no: lineNo,
    item_kind: "CYLINDER",
    cylinder_id: movement.cylinder_id,
    serial_number: movement.cylinder_serial ?? null,
    gas_code: movement.gas_code ?? null,
    capacity_value: movement.capacity_m3 ?? null,
    capacity_unit: movement.capacity_unit ?? null,
    is_rental: movement.movement_kind === "RENTAL",
    ownership_basis: null,
    qty: 1,
    picked_qty: 1,
    delivered_qty: null,
    returned_qty: null,
    condition: movement.condition ?? null,
    notes: null,
    movement_event_id: movement.id,
    accessory_rental_id: null,
    weight_kg: null,
  };
}

function rentalToPdfLine(
  remitoId: number,
  rental: DeliveryNoteLinkedRental,
  lineNo: number,
): RemitoLine {
  const label = [rental.accessory_type, rental.accessory_identifier]
    .filter(Boolean)
    .join(" ");
  return {
    id: rental.id,
    remito_id: remitoId,
    line_no: lineNo,
    item_kind: "ACCESSORY",
    cylinder_id: null,
    accessory_id: rental.accessory_id,
    serial_number: label || null,
    gas_code: null,
    capacity_value: null,
    capacity_unit: null,
    is_rental: rental.charge_basis === "RENTAL",
    ownership_basis: null,
    qty: 1,
    picked_qty: 1,
    delivered_qty: null,
    returned_qty: null,
    condition: null,
    notes: null,
    movement_event_id: null,
    accessory_rental_id: rental.id,
    weight_kg: null,
  };
}

import { sql, type Kysely } from "kysely";
import { ApiErrors } from "../common/errors/api-error";
import type {
  Database,
  MovementKind,
  OwnershipBasis,
} from "../database/schema.types";

export interface EnsureRemitoCylinderLineInput {
  remitoId: number;
  cylinderId: number;
  movementEventId: number;
  movementKind: MovementKind;
  /** Effective gas on the movement (may differ from cylinder master). */
  gasCode: string | null;
  propertyBasis: OwnershipBasis;
}

/**
 * Snapshot the cylinder onto a remito_line and link the movement.
 * Used when a remito is created/linked from the movements path so the
 * Aggregate has lines without a separate "add line" step.
 */
export async function ensureRemitoCylinderLine(
  db: Kysely<Database>,
  input: EnsureRemitoCylinderLineInput,
): Promise<number> {
  const existing = await db
    .selectFrom("remito_line")
    .select("id")
    .where("remito_id", "=", input.remitoId)
    .where("movement_event_id", "=", input.movementEventId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (existing) return Number(existing.id);

  const cylinder = await db
    .selectFrom("cylinder")
    .select([
      "serial_number",
      "gas_code",
      "capacity_m3",
      "capacity_unit",
      "owner_party_id",
      "ownership_basis",
      "condition",
    ])
    .where("id", "=", input.cylinderId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!cylinder) throw ApiErrors.notFound("Cylinder not found");

  const maxRow = await db
    .selectFrom("remito_line")
    .select(sql<string>`coalesce(max(line_no), 0)::int`.as("max_line_no"))
    .where("remito_id", "=", input.remitoId)
    .executeTakeFirst();
  const lineNo = Number(maxRow?.max_line_no ?? 0) + 1;

  const ownershipBasis =
    (cylinder.ownership_basis as OwnershipBasis | null) ?? input.propertyBasis;
  const isRental = input.movementKind === "RENTAL";

  const capacityRaw = cylinder.capacity_m3;
  const capacityValue =
    capacityRaw == null || capacityRaw === "" ? null : Number(capacityRaw);

  const inserted = await db
    .insertInto("remito_line")
    .values({
      remito_id: input.remitoId,
      line_no: lineNo,
      item_kind: "CYLINDER",
      cylinder_id: input.cylinderId,
      serial_number: cylinder.serial_number,
      gas_code: input.gasCode ?? cylinder.gas_code,
      capacity_value: Number.isFinite(capacityValue) ? capacityValue : null,
      capacity_unit: cylinder.capacity_unit,
      owner_party_id:
        cylinder.owner_party_id == null
          ? null
          : Number(cylinder.owner_party_id),
      is_rental: isRental,
      ownership_basis: ownershipBasis,
      qty: 1,
      // Custody already posted on the movement path.
      picked_qty: 1,
      delivered_qty: 1,
      condition: cylinder.condition,
      movement_event_id: input.movementEventId,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return Number(inserted.id);
}

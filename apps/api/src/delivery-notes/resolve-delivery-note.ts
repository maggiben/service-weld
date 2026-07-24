import type { Kysely } from "kysely";
import { remitoTypeForPaperKind } from "@weld/domain";
import type { DeliveryNoteKind } from "../database/schema.types";
import type { Database } from "../database/schema.types";

export interface ResolveDeliveryNoteInput {
  remito_number: string;
  issued_date?: string | null;
  client_party_id?: number | null;
  /** Used only when inserting; existing notes keep their kind. */
  kind?: DeliveryNoteKind;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

/**
 * Find-or-create a delivery note by remito number for operational writes
 * (movements, accessory rentals). Empty/whitespace numbers resolve to null.
 * Implicit creates are CLOSED (custody already posted on the caller path).
 * Concurrent creates race on uq_remito: re-select after unique violation.
 */
export async function resolveDeliveryNote(
  db: Kysely<Database>,
  input: ResolveDeliveryNoteInput,
): Promise<number | null> {
  const remitoNumber = input.remito_number.trim();
  if (!remitoNumber) return null;

  const existing = await db
    .selectFrom("delivery_note")
    .select("id")
    .where("remito_number", "=", remitoNumber)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (existing) return Number(existing.id);

  const kind = input.kind ?? "DELIVERY";
  const remitoType = remitoTypeForPaperKind(kind);

  try {
    const inserted = await db
      .insertInto("delivery_note")
      .values({
        remito_number: remitoNumber,
        kind,
        remito_type: remitoType,
        status: "CLOSED",
        picking_status: "LOADED",
        priority: "NORMAL",
        issued_date: input.issued_date ?? null,
        client_party_id: input.client_party_id ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return Number(inserted.id);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await db
      .selectFrom("delivery_note")
      .select("id")
      .where("remito_number", "=", remitoNumber)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!raced) throw error;
    return Number(raced.id);
  }
}

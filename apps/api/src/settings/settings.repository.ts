import { Inject, Injectable } from "@nestjs/common";
import { SUPPLIER_LOAN_OVERDUE_DAYS } from "@weld/domain";
import type { SystemSettings, UpdateSystemSettingsInput } from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";

export const SETTING_SUPPLIER_LOAN_OVERDUE_DAYS =
  "supplier_loan_overdue_days" as const;

@Injectable()
export class SettingsRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async getSupplierLoanOverdueDays(): Promise<number> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("system_setting")
      .select("value")
      .where("key", "=", SETTING_SUPPLIER_LOAN_OVERDUE_DAYS)
      .executeTakeFirst();
    if (!row) return SUPPLIER_LOAN_OVERDUE_DAYS;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) && parsed >= 1
      ? Math.trunc(parsed)
      : SUPPLIER_LOAN_OVERDUE_DAYS;
  }

  async getSettings(): Promise<SystemSettings> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("system_setting")
      .select(["value", "version"])
      .where("key", "=", SETTING_SUPPLIER_LOAN_OVERDUE_DAYS)
      .executeTakeFirst();

    if (!row) {
      return {
        supplier_loan_overdue_days: SUPPLIER_LOAN_OVERDUE_DAYS,
        version: 0,
      };
    }

    const parsed = Number(row.value);
    return {
      supplier_loan_overdue_days:
        Number.isFinite(parsed) && parsed >= 1
          ? Math.trunc(parsed)
          : SUPPLIER_LOAN_OVERDUE_DAYS,
      version: Number(row.version),
    };
  }

  async updateSettings(
    input: UpdateSystemSettingsInput,
    expectedVersion?: number,
  ): Promise<SystemSettings> {
    const db = resolveDb(this.db);
    const days = String(input.supplier_loan_overdue_days);

    const existing = await db
      .selectFrom("system_setting")
      .select(["version"])
      .where("key", "=", SETTING_SUPPLIER_LOAN_OVERDUE_DAYS)
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto("system_setting")
        .values({
          key: SETTING_SUPPLIER_LOAN_OVERDUE_DAYS,
          value: days,
          version: 1,
        })
        .execute();
      return {
        supplier_loan_overdue_days: input.supplier_loan_overdue_days,
        version: 1,
      };
    }

    const currentVersion = Number(existing.version);
    if (expectedVersion != null && expectedVersion !== currentVersion) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Settings version conflict");
    }

    const updated = await db
      .updateTable("system_setting")
      .set({
        value: days,
        updated_at: new Date(),
        version: currentVersion + 1,
      })
      .where("key", "=", SETTING_SUPPLIER_LOAN_OVERDUE_DAYS)
      .where("version", "=", currentVersion)
      .executeTakeFirst();

    if (Number(updated.numUpdatedRows ?? 0) === 0) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Settings version conflict");
    }

    return {
      supplier_loan_overdue_days: input.supplier_loan_overdue_days,
      version: currentVersion + 1,
    };
  }
}

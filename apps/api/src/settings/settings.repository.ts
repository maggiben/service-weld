import { Inject, Injectable } from "@nestjs/common";
import {
  LONG_OUTSTANDING_DAYS,
  SUPPLIER_LOAN_OVERDUE_DAYS,
} from "@weld/domain";
import type {
  PrimaryLanguage,
  SystemSettings,
  UpdateSystemSettingsInput,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";

export const SETTING_SUPPLIER_LOAN_OVERDUE_DAYS =
  "supplier_loan_overdue_days" as const;
export const SETTING_LONG_OUTSTANDING_DAYS = "long_outstanding_days" as const;
export const SETTING_BUSINESS_TIMEZONE = "business_timezone" as const;
export const SETTING_RENTAL_MIN_DAYS = "rental_min_days" as const;
export const SETTING_PRIMARY_LANGUAGE = "primary_language" as const;

export const DEFAULT_BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
export const DEFAULT_RENTAL_MIN_DAYS = 0;
export const DEFAULT_PRIMARY_LANGUAGE: PrimaryLanguage = "es";

const SETTING_KEYS = [
  SETTING_SUPPLIER_LOAN_OVERDUE_DAYS,
  SETTING_LONG_OUTSTANDING_DAYS,
  SETTING_BUSINESS_TIMEZONE,
  SETTING_RENTAL_MIN_DAYS,
  SETTING_PRIMARY_LANGUAGE,
] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

@Injectable()
export class SettingsRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async getSupplierLoanOverdueDays(): Promise<number> {
    const settings = await this.getSettings();
    return settings.supplier_loan_overdue_days;
  }

  async getLongOutstandingDays(): Promise<number> {
    const settings = await this.getSettings();
    return settings.long_outstanding_days;
  }

  async getBusinessTimezone(): Promise<string> {
    const settings = await this.getSettings();
    return settings.business_timezone;
  }

  async getRentalMinDays(): Promise<number> {
    const settings = await this.getSettings();
    return settings.rental_min_days;
  }

  async getPrimaryLanguage(): Promise<PrimaryLanguage> {
    const settings = await this.getSettings();
    return settings.primary_language;
  }

  async getSettings(): Promise<SystemSettings> {
    const rows = await this.loadRows();
    return this.toSettings(rows);
  }

  async updateSettings(
    input: UpdateSystemSettingsInput,
    expectedVersion?: number,
  ): Promise<SystemSettings> {
    const db = resolveDb(this.db);
    const rows = await this.loadRows();
    const current = this.toSettings(rows);

    if (expectedVersion != null && expectedVersion !== current.version) {
      throw ApiErrors.conflict("VERSION_CONFLICT", "Settings version conflict");
    }

    const nextVersion = current.version + 1;
    const updates: Partial<Record<SettingKey, string>> = {};

    if (input.supplier_loan_overdue_days != null) {
      updates[SETTING_SUPPLIER_LOAN_OVERDUE_DAYS] = String(
        input.supplier_loan_overdue_days,
      );
    }
    if (input.long_outstanding_days != null) {
      updates[SETTING_LONG_OUTSTANDING_DAYS] = String(
        input.long_outstanding_days,
      );
    }
    if (input.business_timezone != null) {
      updates[SETTING_BUSINESS_TIMEZONE] = input.business_timezone;
    }
    if (input.rental_min_days != null) {
      updates[SETTING_RENTAL_MIN_DAYS] = String(input.rental_min_days);
    }
    if (input.primary_language != null) {
      updates[SETTING_PRIMARY_LANGUAGE] = input.primary_language;
    }

    for (const [key, value] of Object.entries(updates) as [
      SettingKey,
      string,
    ][]) {
      const existing = rows.get(key);
      if (!existing) {
        await db
          .insertInto("system_setting")
          .values({ key, value, version: nextVersion })
          .execute();
        continue;
      }

      const updated = await db
        .updateTable("system_setting")
        .set({
          value,
          updated_at: new Date(),
          version: nextVersion,
        })
        .where("key", "=", key)
        .where("version", "=", existing.version)
        .executeTakeFirst();

      if (Number(updated.numUpdatedRows ?? 0) === 0) {
        throw ApiErrors.conflict(
          "VERSION_CONFLICT",
          "Settings version conflict",
        );
      }
    }

    return this.getSettings();
  }

  private async loadRows(): Promise<
    Map<SettingKey, { value: string; version: number }>
  > {
    const db = resolveDb(this.db);
    const rows = await db
      .selectFrom("system_setting")
      .select(["key", "value", "version"])
      .where("key", "in", [...SETTING_KEYS])
      .execute();

    const map = new Map<SettingKey, { value: string; version: number }>();
    for (const row of rows) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
        map.set(row.key as SettingKey, {
          value: row.value,
          version: Number(row.version),
        });
      }
    }
    return map;
  }

  private toSettings(
    rows: Map<SettingKey, { value: string; version: number }>,
  ): SystemSettings {
    const overdue = rows.get(SETTING_SUPPLIER_LOAN_OVERDUE_DAYS);
    const longOutstanding = rows.get(SETTING_LONG_OUTSTANDING_DAYS);
    const timezone = rows.get(SETTING_BUSINESS_TIMEZONE);
    const minDays = rows.get(SETTING_RENTAL_MIN_DAYS);
    const language = rows.get(SETTING_PRIMARY_LANGUAGE);

    const overdueParsed = overdue ? Number(overdue.value) : NaN;
    const longOutstandingParsed = longOutstanding
      ? Number(longOutstanding.value)
      : NaN;
    const minDaysParsed = minDays ? Number(minDays.value) : NaN;
    const languageValue = language?.value;
    const primaryLanguage: PrimaryLanguage =
      languageValue === "en" || languageValue === "es"
        ? languageValue
        : DEFAULT_PRIMARY_LANGUAGE;

    const versions = [...rows.values()].map((row) => row.version);
    const version = versions.length > 0 ? Math.max(...versions) : 0;

    return {
      supplier_loan_overdue_days:
        Number.isFinite(overdueParsed) && overdueParsed >= 1
          ? Math.trunc(overdueParsed)
          : SUPPLIER_LOAN_OVERDUE_DAYS,
      long_outstanding_days:
        Number.isFinite(longOutstandingParsed) && longOutstandingParsed >= 1
          ? Math.trunc(longOutstandingParsed)
          : LONG_OUTSTANDING_DAYS,
      business_timezone: timezone?.value || DEFAULT_BUSINESS_TIMEZONE,
      rental_min_days:
        Number.isFinite(minDaysParsed) && minDaysParsed >= 0
          ? Math.trunc(minDaysParsed)
          : DEFAULT_RENTAL_MIN_DAYS,
      primary_language: primaryLanguage,
      version,
    };
  }
}

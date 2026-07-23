import { z } from "zod";

/**
 * System settings (`GET/PATCH /settings`, table `system_setting`).
 * Specs: 003 R7, 004 Settings, 006 R10, 009, 012 R2; decisions D-13 / D-14 / D-17.
 */

/** Days after which an open supplier loan loop is overdue (US-21). */
export const SupplierLoanOverdueDays = z.number().int().min(1).max(3650);

/**
 * Days after which an OPEN movement raises a LONG_OUTSTANDING alert.
 * Default 90 (product default); editable via Configuración.
 */
export const LongOutstandingDays = z.number().int().min(1).max(3650);

/** IANA timezone used for business "today" / aging (D-13). */
export const BusinessTimezone = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid IANA timezone" },
  );

/**
 * Minimum billable days for a rental / loan period (009 C2).
 * `0` preserves D-14 (exact calendar days, same-day → 0).
 */
export const RentalMinDays = z.number().int().min(0).max(365);

/** Org default UI / document language (D-17; 000 C1 / 006 R7). */
export const PrimaryLanguage = z.enum(["es", "en"]);
export type PrimaryLanguage = z.infer<typeof PrimaryLanguage>;

export const SystemSettings = z.object({
  supplier_loan_overdue_days: SupplierLoanOverdueDays,
  long_outstanding_days: LongOutstandingDays,
  business_timezone: BusinessTimezone,
  rental_min_days: RentalMinDays,
  primary_language: PrimaryLanguage,
  /** Aggregate optimistic-concurrency token: max(row.version) across known keys. */
  version: z.number().int(),
});
export type SystemSettings = z.infer<typeof SystemSettings>;

/** Partial update — at least one field required. */
export const UpdateSystemSettingsInput = z
  .object({
    supplier_loan_overdue_days: SupplierLoanOverdueDays.optional(),
    long_outstanding_days: LongOutstandingDays.optional(),
    business_timezone: BusinessTimezone.optional(),
    rental_min_days: RentalMinDays.optional(),
    primary_language: PrimaryLanguage.optional(),
  })
  .refine(
    (value) =>
      value.supplier_loan_overdue_days != null ||
      value.long_outstanding_days != null ||
      value.business_timezone != null ||
      value.rental_min_days != null ||
      value.primary_language != null,
    { message: "At least one setting is required" },
  );
export type UpdateSystemSettingsInput = z.infer<
  typeof UpdateSystemSettingsInput
>;

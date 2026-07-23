import { z } from "zod";

export const MigrationWorkbookSlot = z.enum(["junin", "chacabuco", "propios"]);
export type MigrationWorkbookSlot = z.infer<typeof MigrationWorkbookSlot>;

export const MigrationExportDataset = z.enum([
  "clients",
  "cylinders",
  "movements",
  "exceptions",
  "all",
]);
export type MigrationExportDataset = z.infer<typeof MigrationExportDataset>;

export const MigrationUploadedFile = z.object({
  slot: MigrationWorkbookSlot,
  original_name: z.string(),
  size_bytes: z.number().int().nonnegative(),
  uploaded_at: z.string().datetime(),
});
export type MigrationUploadedFile = z.infer<typeof MigrationUploadedFile>;

export const MigrationSnapshot = z.object({
  id: z.string(),
  label: z.string(),
  created_at: z.string(),
  row_counts: z.record(z.number()),
  dump_bytes: z.number().int().nonnegative().optional(),
  elapsed_s: z.number().optional(),
  marked_good: z.boolean().optional(),
});
export type MigrationSnapshot = z.infer<typeof MigrationSnapshot>;

export const MigrationDataStatus = z.object({
  uploads: z.array(MigrationUploadedFile),
  ready_to_run: z.boolean(),
  missing_slots: z.array(MigrationWorkbookSlot),
  snapshots: z.array(MigrationSnapshot),
  last_report: z.record(z.unknown()).nullable(),
  last_report_at: z.string().datetime().nullable(),
  busy: z.boolean(),
  live_job: z
    .object({
      kind: z.enum(["sync", "dry_run"]),
      state: z.enum(["running", "succeeded", "failed"]),
      phase: z.string(),
      progress_pct: z.number().min(0).max(100).nullable(),
      lines: z.array(z.string()),
      error: z.string().nullable(),
      result: z.record(z.unknown()).nullable(),
      started_at: z.string().datetime(),
      finished_at: z.string().datetime().nullable(),
    })
    .nullable(),
  workbook_guide: z.array(
    z.object({
      slot: MigrationWorkbookSlot,
      title: z.string(),
      filename_hint: z.string(),
      description: z.string(),
      required: z.boolean(),
    }),
  ),
});
export type MigrationDataStatus = z.infer<typeof MigrationDataStatus>;

export const MigrationJobAccepted = z.object({
  accepted: z.literal(true),
  kind: z.enum(["sync", "dry_run"]),
});
export type MigrationJobAccepted = z.infer<typeof MigrationJobAccepted>;

export const MigrationRunRequest = z.object({
  dry_run: z.boolean().default(true),
  skip_propios: z.boolean().default(false),
  skip_clients: z.boolean().default(false),
  label: z.string().trim().max(120).optional(),
});
export type MigrationRunRequest = z.infer<typeof MigrationRunRequest>;

export const MigrationRunResult = z.object({
  dry_run: z.boolean(),
  snapshot_id: z.string().nullable(),
  report: z.record(z.unknown()),
});
export type MigrationRunResult = z.infer<typeof MigrationRunResult>;

export const MigrationRollbackRequest = z.object({
  snapshot_id: z.string().min(1),
});
export type MigrationRollbackRequest = z.infer<typeof MigrationRollbackRequest>;

export const MigrationMarkGoodRequest = z.object({
  snapshot_id: z.string().min(1),
  good: z.boolean().default(true),
});
export type MigrationMarkGoodRequest = z.infer<typeof MigrationMarkGoodRequest>;

/** Exact phrase the admin must type to wipe business data. */
export const MIGRATION_PURGE_CONFIRMATION = "VACIAR DATOS" as const;

export const MigrationPurgeBusinessRequest = z.object({
  confirmation: z.literal(MIGRATION_PURGE_CONFIRMATION),
});
export type MigrationPurgeBusinessRequest = z.infer<
  typeof MigrationPurgeBusinessRequest
>;

export const MigrationPurgeBusinessResult = z.object({
  ok: z.literal(true),
  truncated_tables: z.array(z.string()),
  parties_removed: z.number().int().nonnegative(),
  preserved: z.array(z.string()),
});
export type MigrationPurgeBusinessResult = z.infer<
  typeof MigrationPurgeBusinessResult
>;

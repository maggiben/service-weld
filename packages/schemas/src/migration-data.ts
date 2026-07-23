import { z as zod } from "zod";

export const MigrationWorkbookSlot = zod.enum([
  "junin",
  "chacabuco",
  "propios",
]);
export type MigrationWorkbookSlot = zod.infer<typeof MigrationWorkbookSlot>;

export const MigrationExportDataset = zod.enum([
  "clients",
  "cylinders",
  "movements",
  "exceptions",
  "all",
]);
export type MigrationExportDataset = zod.infer<typeof MigrationExportDataset>;

export const MigrationUploadedFile = zod.object({
  slot: MigrationWorkbookSlot,
  original_name: zod.string(),
  size_bytes: zod.number().int().nonnegative(),
  uploaded_at: zod.string().datetime(),
});
export type MigrationUploadedFile = zod.infer<typeof MigrationUploadedFile>;

export const MigrationSnapshot = zod.object({
  id: zod.string(),
  label: zod.string(),
  created_at: zod.string(),
  row_counts: zod.record(zod.number()),
  dump_bytes: zod.number().int().nonnegative().optional(),
  elapsed_s: zod.number().optional(),
  marked_good: zod.boolean().optional(),
});
export type MigrationSnapshot = zod.infer<typeof MigrationSnapshot>;

export const MigrationDataStatus = zod.object({
  uploads: zod.array(MigrationUploadedFile),
  ready_to_run: zod.boolean(),
  missing_slots: zod.array(MigrationWorkbookSlot),
  snapshots: zod.array(MigrationSnapshot),
  last_report: zod.record(zod.unknown()).nullable(),
  last_report_at: zod.string().datetime().nullable(),
  busy: zod.boolean(),
  live_job: zod
    .object({
      kind: zod.enum(["sync", "dry_run"]),
      state: zod.enum(["running", "succeeded", "failed"]),
      phase: zod.string(),
      progress_pct: zod.number().min(0).max(100).nullable(),
      lines: zod.array(zod.string()),
      error: zod.string().nullable(),
      result: zod.record(zod.unknown()).nullable(),
      started_at: zod.string().datetime(),
      finished_at: zod.string().datetime().nullable(),
    })
    .nullable(),
  workbook_guide: zod.array(
    zod.object({
      slot: MigrationWorkbookSlot,
      title: zod.string(),
      filename_hint: zod.string(),
      description: zod.string(),
      required: zod.boolean(),
    }),
  ),
});
export type MigrationDataStatus = zod.infer<typeof MigrationDataStatus>;

export const MigrationJobAccepted = zod.object({
  accepted: zod.literal(true),
  kind: zod.enum(["sync", "dry_run"]),
});
export type MigrationJobAccepted = zod.infer<typeof MigrationJobAccepted>;

export const MigrationRunRequest = zod.object({
  dry_run: zod.boolean().default(true),
  skip_propios: zod.boolean().default(false),
  skip_clients: zod.boolean().default(false),
  label: zod.string().trim().max(120).optional(),
});
export type MigrationRunRequest = zod.infer<typeof MigrationRunRequest>;

export const MigrationRunResult = zod.object({
  dry_run: zod.boolean(),
  snapshot_id: zod.string().nullable(),
  report: zod.record(zod.unknown()),
});
export type MigrationRunResult = zod.infer<typeof MigrationRunResult>;

export const MigrationRollbackRequest = zod.object({
  snapshot_id: zod.string().min(1),
});
export type MigrationRollbackRequest = zod.infer<
  typeof MigrationRollbackRequest
>;

export const MigrationMarkGoodRequest = zod.object({
  snapshot_id: zod.string().min(1),
  good: zod.boolean().default(true),
});
export type MigrationMarkGoodRequest = zod.infer<
  typeof MigrationMarkGoodRequest
>;

/** Exact phrase the admin must type to wipe business data. */
export const MIGRATION_PURGE_CONFIRMATION = "VACIAR DATOS" as const;

export const MigrationPurgeBusinessRequest = zod.object({
  confirmation: zod.literal(MIGRATION_PURGE_CONFIRMATION),
});
export type MigrationPurgeBusinessRequest = zod.infer<
  typeof MigrationPurgeBusinessRequest
>;

export const MigrationPurgeBusinessResult = zod.object({
  ok: zod.literal(true),
  truncated_tables: zod.array(zod.string()),
  parties_removed: zod.number().int().nonnegative(),
  preserved: zod.array(zod.string()),
});
export type MigrationPurgeBusinessResult = zod.infer<
  typeof MigrationPurgeBusinessResult
>;

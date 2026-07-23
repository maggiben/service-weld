import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { sql } from "kysely";
import type {
  MigrationDataStatus,
  MigrationExportDataset,
  MigrationJobAccepted,
  MigrationPurgeBusinessResult,
  MigrationRunRequest,
  MigrationRunResult,
  MigrationSnapshot,
  MigrationUploadedFile,
  MigrationWorkbookSlot,
} from "@weld/schemas";
import type { Env } from "../config/config.schema";
import { KYSELY, type DB } from "../database/database.module";

/** Business tables wiped by danger-zone purge (users/settings/geo/gas catalog kept). */
const BUSINESS_TABLES = [
  "charge_line",
  "invoice",
  "billing_run",
  "accessory_rental",
  "accessory",
  "stock_transfer",
  "supplier_loan_cycle",
  "cylinder_sale",
  "movement_event",
  "delivery_note",
  "battery_member",
  "cylinder",
  "cylinder_battery",
  "rental_rate",
  "client_contact",
  "client",
  "client_history",
  "cylinder_history",
  "migration_exception",
  "alert",
  "audit_log",
] as const;

const PRESERVED = [
  "app_user",
  "role",
  "user_role",
  "user_territory_scope",
  "refresh_token",
  "system_setting",
  "gas_type",
  "gas_alias",
  "dispatch_territory",
  "locality",
  "party (SELF + linked to users)",
] as const;

const SLOTS: MigrationWorkbookSlot[] = ["junin", "chacabuco", "propios"];

const WORKBOOK_GUIDE: MigrationDataStatus["workbook_guide"] = [
  {
    slot: "junin",
    title: "Junín — libro de clientes",
    filename_hint: "CILINDRO CLIENT REPARTO….xls",
    description:
      "Excel .xls legado con una hoja por cliente de Junín (paneles alquiler + recarga). No subas Chacabuco ni Propios acá.",
    required: true,
  },
  {
    slot: "chacabuco",
    title: "Chacabuco — libro de clientes",
    filename_hint: "CILINDROS CLIENTES CHACABUCO.xls",
    description:
      "Excel .xls legado con una hoja por cliente de Chacabuco. Va separado de Junín aunque haya nombres parecidos.",
    required: true,
  },
  {
    slot: "propios",
    title: "Propios — circulación de cilindros",
    filename_hint: "CILINDROS PROPIOS.xls",
    description:
      "Hojas por cilindro (flota). Sirve para mergear movimientos espejo e importar seriales/capacidades. Es el archivo más grande.",
    required: true,
  },
];

interface UploadManifest {
  files: Partial<
    Record<
      MigrationWorkbookSlot,
      {
        original_name: string;
        size_bytes: number;
        uploaded_at: string;
        stored_name: string;
      }
    >
  >;
}

type LiveJobKind = "sync" | "dry_run";
type LiveJobState = "running" | "succeeded" | "failed";

interface LiveJob {
  kind: LiveJobKind;
  state: LiveJobState;
  phase: string;
  progress_pct: number | null;
  lines: string[];
  error: string | null;
  result: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
}

const MAX_LIVE_LINES = 800;

@Injectable()
export class MigrationDataService implements OnModuleInit {
  private busy = false;
  private liveJob: LiveJob | null = null;
  private readonly dataDir: string;
  private readonly uploadsDir: string;
  private readonly snapshotsDir: string;
  private readonly exportsDir: string;
  private readonly reportPath: string;
  private readonly manifestPath: string;
  private readonly pythonBin: string;
  private readonly migrationRoot: string;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(KYSELY) private readonly db: DB,
  ) {
    const configured =
      process.env.MIGRATION_DATA_DIR?.trim() ||
      join(process.cwd(), "../../migration/data");
    this.dataDir = resolve(configured);
    this.uploadsDir = join(this.dataDir, "uploads");
    this.snapshotsDir = join(this.dataDir, "snapshots");
    this.exportsDir = join(this.dataDir, "exports");
    this.reportPath = join(this.dataDir, "last_report.json");
    this.manifestPath = join(this.uploadsDir, "manifest.json");
    this.pythonBin = process.env.PYTHON_BIN?.trim() || "python3";
    this.migrationRoot = resolve(
      process.env.MIGRATION_PACKAGE_DIR?.trim() ||
        join(process.cwd(), "../../migration"),
    );
  }

  onModuleInit(): void {
    for (const dir of [
      this.dataDir,
      this.uploadsDir,
      this.snapshotsDir,
      this.exportsDir,
    ]) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.manifestPath)) {
      this.writeManifest({ files: {} });
    }
  }

  getStatus(): MigrationDataStatus {
    const manifest = this.readManifest();
    const uploads: MigrationUploadedFile[] = [];
    const missing: MigrationWorkbookSlot[] = [];
    for (const slot of SLOTS) {
      const entry = manifest.files[slot];
      const path = entry
        ? join(this.uploadsDir, entry.stored_name)
        : join(this.uploadsDir, `${slot}.xls`);
      if (entry && existsSync(path)) {
        uploads.push({
          slot,
          original_name: entry.original_name,
          size_bytes: entry.size_bytes,
          uploaded_at: entry.uploaded_at,
        });
      } else {
        missing.push(slot);
      }
    }

    let lastReport: Record<string, unknown> | null = null;
    let lastReportAt: string | null = null;
    if (existsSync(this.reportPath)) {
      try {
        lastReport = JSON.parse(
          readFileSync(this.reportPath, "utf8"),
        ) as Record<string, unknown>;
        lastReportAt = statSync(this.reportPath).mtime.toISOString();
      } catch {
        lastReport = null;
      }
    }

    return {
      uploads,
      ready_to_run: missing.length === 0,
      missing_slots: missing,
      snapshots: this.listSnapshotsLocal(),
      last_report: lastReport,
      last_report_at: lastReportAt,
      busy: this.busy,
      live_job: this.liveJob,
      workbook_guide: WORKBOOK_GUIDE,
    };
  }

  async saveUpload(
    slot: MigrationWorkbookSlot,
    file: Express.Multer.File,
  ): Promise<MigrationUploadedFile> {
    this.assertIdle();
    if (!SLOTS.includes(slot)) {
      throw new BadRequestException(`Unknown slot: ${slot}`);
    }
    const name = file.originalname || `${slot}.xls`;
    if (!/\.xls$/i.test(name)) {
      throw new BadRequestException(
        "Only legacy Excel .xls (BIFF) files are accepted — not .xlsx",
      );
    }
    const size = file.size || file.buffer?.length || 0;
    if (size <= 0 && !file.buffer?.length && !file.path) {
      throw new BadRequestException("Empty upload");
    }
    const stored = `${slot}.xls`;
    const dest = join(this.uploadsDir, stored);
    if (file.buffer?.length) {
      writeFileSync(dest, file.buffer);
    } else if (file.path) {
      renameSync(file.path, dest);
    } else {
      throw new BadRequestException("Empty upload");
    }
    const uploaded: MigrationUploadedFile = {
      slot,
      original_name: name,
      size_bytes: statSync(dest).size,
      uploaded_at: new Date().toISOString(),
    };
    const manifest = this.readManifest();
    manifest.files[slot] = {
      original_name: uploaded.original_name,
      size_bytes: uploaded.size_bytes,
      uploaded_at: uploaded.uploaded_at,
      stored_name: stored,
    };
    this.writeManifest(manifest);
    return uploaded;
  }

  /**
   * Start sync/dry-run in the background so the HTTP request does not time out
   * on large workbooks. Progress + terminal lines are exposed via getStatus().
   */
  startImport(body: MigrationRunRequest): MigrationJobAccepted {
    this.assertIdle();
    const status = this.getStatus();
    if (!body.skip_clients) {
      if (
        status.missing_slots.includes("junin") ||
        status.missing_slots.includes("chacabuco")
      ) {
        throw new BadRequestException(
          "Missing Junín and/or Chacabuco workbook upload.",
        );
      }
    }
    if (!body.skip_propios && status.missing_slots.includes("propios")) {
      throw new BadRequestException("Missing Propios workbook upload.");
    }

    const kind: LiveJobKind = body.dry_run ? "dry_run" : "sync";
    this.busy = true;
    this.liveJob = {
      kind,
      state: "running",
      phase: "starting",
      progress_pct: 1,
      lines: [],
      error: null,
      result: null,
      started_at: new Date().toISOString(),
      finished_at: null,
    };
    this.appendLiveLine(`[weld] starting ${kind}…`);

    void this.runImportBackground(body).catch((err: unknown) => {
      this.finishLiveJob("failed", nestErrorMessage(err));
    });

    return { accepted: true, kind };
  }

  private async runImportBackground(body: MigrationRunRequest): Promise<void> {
    let snapshotId: string | null = null;
    try {
      if (!body.dry_run) {
        this.setLivePhase("snapshot", 5);
        this.appendLiveLine("[weld] creating pre-sync database snapshot…");
        const label =
          body.label?.trim() ||
          `pre-sync ${new Date().toISOString().slice(0, 19)}`;
        const snapRaw = await this.runPythonJson([
          "--create-snapshot",
          label,
          "--snapshots-dir",
          this.snapshotsDir,
        ]);
        snapshotId = String(snapRaw.id ?? "");
        this.appendLiveLine(`[weld] snapshot ready: ${snapshotId || "(none)"}`);
      }

      this.setLivePhase("extract", 12);
      const args = [
        `--junin=${join(this.uploadsDir, "junin.xls")}`,
        `--chacabuco=${join(this.uploadsDir, "chacabuco.xls")}`,
        `--propios=${join(this.uploadsDir, "propios.xls")}`,
        `--report=${this.reportPath}`,
      ];
      if (body.dry_run) args.push("--dry-run");
      if (body.skip_propios) args.push("--skip-propios");
      if (body.skip_clients) args.push("--skip-clients");

      const report = await this.runPythonJson(args);
      writeFileSync(this.reportPath, JSON.stringify(report, null, 2));
      const result: MigrationRunResult = {
        dry_run: body.dry_run,
        snapshot_id: snapshotId,
        report,
      };
      if (this.liveJob) {
        this.liveJob.result = result as unknown as Record<string, unknown>;
      }
      this.setLivePhase("done", 100);
      this.appendLiveLine("[weld] finished successfully");
      this.finishLiveJob("succeeded");
    } catch (err) {
      const message = nestErrorMessage(err);
      this.appendLiveLine(`[weld] ERROR: ${message.slice(0, 2000)}`);
      this.finishLiveJob("failed", message);
    }
  }

  /** @deprecated Prefer startImport — kept for tests that call the body path. */
  async runImport(body: MigrationRunRequest): Promise<MigrationRunResult> {
    const accepted = this.startImport(body);
    // Wait until job finishes (used by older callers / tests).
    while (this.busy) {
      await new Promise((row) => setTimeout(row, 200));
    }
    if (this.liveJob?.state === "failed") {
      throw new BadRequestException(
        this.liveJob.error ?? `${accepted.kind} failed`,
      );
    }
    const result = this.liveJob?.result;
    if (!result) {
      throw new ServiceUnavailableException(
        "Migration finished without result",
      );
    }
    return result as unknown as MigrationRunResult;
  }

  private setLivePhase(phase: string, progressPct: number | null): void {
    if (!this.liveJob || this.liveJob.state !== "running") return;
    this.liveJob.phase = phase;
    if (progressPct != null) this.liveJob.progress_pct = progressPct;
  }

  private appendLiveLine(line: string): void {
    if (!this.liveJob) return;
    const cleaned = line.replace(/\r/g, "").trimEnd();
    if (!cleaned) return;
    for (const part of cleaned.split("\n")) {
      const row = part.trimEnd();
      if (!row) continue;
      this.liveJob.lines.push(row);
      this.inferProgressFromLine(row);
    }
    if (this.liveJob.lines.length > MAX_LIVE_LINES) {
      this.liveJob.lines = this.liveJob.lines.slice(-MAX_LIVE_LINES);
    }
  }

  private inferProgressFromLine(line: string): void {
    if (!this.liveJob || this.liveJob.state !== "running") return;
    const lower = line.toLowerCase();
    if (
      lower.includes("extracting junín") ||
      lower.includes("extracting junin")
    ) {
      this.setLivePhase("extract_junin", 18);
    } else if (lower.includes("extracting chacabuco")) {
      this.setLivePhase("extract_chacabuco", 32);
    } else if (lower.includes("extracting propios")) {
      this.setLivePhase("extract_propios", 48);
    } else if (lower.includes("extract done")) {
      this.setLivePhase("extract_done", 55);
    } else if (lower.includes("loading into db")) {
      this.setLivePhase("load", 60);
    } else if (
      lower.includes("seed parties") ||
      lower.includes("loading cylinders")
    ) {
      this.setLivePhase("load_cylinders", 65);
    } else if (lower.includes("loading clients")) {
      this.setLivePhase("load_clients", 72);
    } else if (
      lower.includes("loading movements") ||
      lower.includes("movements inserted")
    ) {
      this.setLivePhase("load_movements", 82);
      const member = /(\d+)\s*$/.exec(line.replace(/,/g, ""));
      if (member) {
        const num = Number(member[1]);
        if (Number.isFinite(num) && num > 0) {
          // Soft ramp while movements stream in.
          this.liveJob.progress_pct = Math.min(95, 82 + Math.floor(num / 5000));
        }
      }
    } else if (lower.includes("wrote report")) {
      this.setLivePhase("report", 98);
    }
  }

  private finishLiveJob(state: "succeeded" | "failed", error?: string): void {
    if (this.liveJob) {
      this.liveJob.state = state;
      this.liveJob.finished_at = new Date().toISOString();
      if (state === "succeeded") {
        this.liveJob.progress_pct = 100;
        this.liveJob.error = null;
      } else {
        this.liveJob.error = error ?? "Migration failed";
      }
    }
    this.busy = false;
  }

  async rollback(snapshotId: string): Promise<Record<string, unknown>> {
    this.assertIdle();
    this.busy = true;
    try {
      return await this.runPythonJson([
        "--rollback-snapshot",
        snapshotId,
        "--snapshots-dir",
        this.snapshotsDir,
      ]);
    } finally {
      this.busy = false;
    }
  }

  markGood(snapshotId: string, good: boolean): MigrationSnapshot {
    const metaPath = join(this.snapshotsDir, snapshotId, "meta.json");
    if (!existsSync(metaPath)) {
      throw new NotFoundException(`Snapshot not found: ${snapshotId}`);
    }
    const meta = JSON.parse(
      readFileSync(metaPath, "utf8"),
    ) as MigrationSnapshot;
    meta.marked_good = good;
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  }

  /**
   * Wipe business/domain data for a clean re-import. Keeps users, roles,
   * settings, gas catalog, and territories/localities.
   */
  async purgeBusinessData(): Promise<MigrationPurgeBusinessResult> {
    this.assertIdle();
    this.busy = true;
    try {
      const truncated = [...BUSINESS_TABLES];
      await sql
        .raw(
          `TRUNCATE TABLE ${truncated.map((territory) => `"${territory}"`).join(", ")} RESTART IDENTITY CASCADE`,
        )
        .execute(this.db);

      const deleted = await sql<{ count: string }>`
        WITH doomed AS (
          DELETE FROM party p
          WHERE NOT p.is_self
            AND NOT EXISTS (
              SELECT 1 FROM app_user u
              WHERE u.party_id = p.id
            )
          RETURNING 1
        )
        SELECT count(*)::text AS count FROM doomed
      `.execute(this.db);
      const partiesRemoved = Number(deleted.rows[0]?.count ?? 0);

      // Restore schema.sql seed suppliers / sub-distributors (011 R2). Purge must
      // not leave only SELF — otherwise Sync owns SUPPLIER cylinders as SELF (BR-07).
      await sql`
        INSERT INTO party (party_type, display_name)
        SELECT v.party_type::party_type, v.display_name
        FROM (
          VALUES
            ('SUPPLIER', 'Linde'),
            ('SUPPLIER', 'Intergas'),
            ('SUPPLIER', 'Nordelta'),
            ('SUPPLIER', 'DSJ'),
            ('SUBDISTRIBUTOR', 'Ceres'),
            ('SUBDISTRIBUTOR', 'Pantiga'),
            ('SUBDISTRIBUTOR', 'Ezequiel'),
            ('SUBDISTRIBUTOR', 'Tito'),
            ('SUBDISTRIBUTOR', 'Buroni')
        ) AS v(party_type, display_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM party p
          WHERE p.party_type = v.party_type::party_type
            AND p.display_name = v.display_name
            AND p.deleted_at IS NULL
        )
      `.execute(this.db);

      if (existsSync(this.reportPath)) {
        try {
          writeFileSync(
            this.reportPath,
            JSON.stringify(
              {
                purged_at: new Date().toISOString(),
                note: "Business data wiped via admin danger zone",
              },
              null,
              2,
            ),
          );
        } catch {
          // non-fatal
        }
      }

      return {
        ok: true,
        truncated_tables: truncated,
        parties_removed: partiesRemoved,
        preserved: [...PRESERVED],
      };
    } finally {
      this.busy = false;
    }
  }

  async exportDataset(
    dataset: MigrationExportDataset,
  ): Promise<{ filePath: string; downloadName: string }> {
    this.assertIdle();
    this.busy = true;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outDir = join(this.exportsDir, stamp);
      mkdirSync(outDir, { recursive: true });

      if (dataset === "all") {
        await this.runPythonJson(["--export", "all", "--export-dir", outDir]);
        const zipPath = join(outDir, "weld-export.zip");
        await this.zipXlsx(outDir, zipPath);
        return { filePath: zipPath, downloadName: `weld-export-${stamp}.zip` };
      }

      await this.runPythonJson(["--export", dataset, "--export-dir", outDir]);
      const filePath = join(outDir, `${dataset}.xlsx`);
      if (!existsSync(filePath)) {
        throw new ServiceUnavailableException("Export file missing");
      }
      return {
        filePath,
        downloadName: `weld-${dataset}-${stamp}.xlsx`,
      };
    } finally {
      this.busy = false;
    }
  }

  private async zipXlsx(outDir: string, zipPath: string): Promise<void> {
    const code = `
import json, zipfile
from pathlib import Path
out = Path(${JSON.stringify(outDir)})
zip_path = Path(${JSON.stringify(zipPath)})
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for p in sorted(out.glob("*.xlsx")):
        zf.write(p, p.name)
print(json.dumps({"path": str(zip_path)}))
`;
    await this.runPythonInline(code);
  }

  private listSnapshotsLocal(): MigrationSnapshot[] {
    if (!existsSync(this.snapshotsDir)) return [];
    const out: MigrationSnapshot[] = [];
    for (const name of readdirSync(this.snapshotsDir).sort().reverse()) {
      const metaPath = join(this.snapshotsDir, name, "meta.json");
      if (!existsSync(metaPath)) continue;
      try {
        out.push(
          JSON.parse(readFileSync(metaPath, "utf8")) as MigrationSnapshot,
        );
      } catch {
        // skip corrupt
      }
    }
    return out;
  }

  private assertIdle(): void {
    if (this.busy) {
      throw new ConflictException(
        "A migration job is already running. Wait for it to finish.",
      );
    }
  }

  private readManifest(): UploadManifest {
    try {
      return JSON.parse(
        readFileSync(this.manifestPath, "utf8"),
      ) as UploadManifest;
    } catch {
      return { files: {} };
    }
  }

  private writeManifest(manifest: UploadManifest): void {
    writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  private databaseUrl(): string {
    return this.config.get("DATABASE_URL", { infer: true });
  }

  private runPythonJson(args: string[]): Promise<Record<string, unknown>> {
    const dsn = this.databaseUrl();
    return this.spawnJson(this.pythonBin, [
      "-m",
      "weld_migration",
      `--database-url=${dsn}`,
      ...args,
    ]);
  }

  private runPythonInline(code: string): Promise<Record<string, unknown>> {
    return this.spawnJson(this.pythonBin, ["-c", code]);
  }

  private spawnJson(
    bin: string,
    cmdArgs: string[],
  ): Promise<Record<string, unknown>> {
    const dsn = this.databaseUrl();
    return new Promise((resolvePromise, reject) => {
      const env = {
        ...process.env,
        DATABASE_URL: dsn,
        PYTHONPATH: this.migrationRoot,
        MIGRATION_DATA_DIR: this.dataDir,
        PYTHONUNBUFFERED: "1",
      };
      const child = spawn(bin, cmdArgs, {
        env,
        cwd: this.migrationRoot,
      });
      let stdout = "";
      let stderr = "";
      let stdoutCarry = "";
      let stderrCarry = "";
      const pushChunk = (chunk: Buffer, stream: "stdout" | "stderr") => {
        const text = chunk.toString("utf8");
        if (stream === "stdout") stdout += text;
        else stderr += text;
        const carry = stream === "stdout" ? stdoutCarry : stderrCarry;
        const combined = carry + text;
        const parts = combined.split("\n");
        if (stream === "stdout") stdoutCarry = parts.pop() ?? "";
        else stderrCarry = parts.pop() ?? "";
        for (const line of parts) this.appendLiveLine(line);
      };
      child.stdout.on("data", (chunk: Buffer) => pushChunk(chunk, "stdout"));
      child.stderr.on("data", (chunk: Buffer) => pushChunk(chunk, "stderr"));
      child.on("error", (err) => {
        reject(
          new ServiceUnavailableException(
            `Failed to start Python migrator (${bin}): ${err.message}`,
          ),
        );
      });
      child.on("close", (code) => {
        if (stdoutCarry.trim()) this.appendLiveLine(stdoutCarry);
        if (stderrCarry.trim()) this.appendLiveLine(stderrCarry);
        if (code !== 0) {
          reject(
            new BadRequestException(
              `Migrator exited ${code}: ${(stderr || stdout).slice(-4000)}`,
            ),
          );
          return;
        }
        const jsonBlob = extractLastJson(stdout);
        if (!jsonBlob) {
          reject(
            new ServiceUnavailableException(
              `Migrator produced no JSON. stderr: ${stderr.slice(-2000)}`,
            ),
          );
          return;
        }
        try {
          resolvePromise(JSON.parse(jsonBlob) as Record<string, unknown>);
        } catch (err) {
          reject(
            new ServiceUnavailableException(
              `Invalid migrator JSON: ${(err as Error).message}`,
            ),
          );
        }
      });
    });
  }
}

function extractLastJson(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  let depth = 0;
  let start = -1;
  let last: string | null = null;
  for (let index = 0; index < trimmed.length; index++) {
    const ch = trimmed[index];
    if (ch === "{") {
      if (depth === 0) start = index;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        last = trimmed.slice(start, index + 1);
        start = -1;
      }
    }
  }
  return last;
}

function nestErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "getResponse" in err &&
    typeof (err as { getResponse: () => unknown }).getResponse === "function"
  ) {
    const response = (err as { getResponse: () => unknown }).getResponse();
    if (typeof response === "string") return response;
    if (response && typeof response === "object" && "message" in response) {
      const message = (response as { message: unknown }).message;
      if (Array.isArray(message)) return message.map(String).join("; ");
      if (message != null) return String(message);
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export { extractLastJson };

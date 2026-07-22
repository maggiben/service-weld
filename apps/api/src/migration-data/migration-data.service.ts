import {
  BadRequestException,
  ConflictException,
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
import type {
  MigrationDataStatus,
  MigrationExportDataset,
  MigrationRunRequest,
  MigrationRunResult,
  MigrationSnapshot,
  MigrationUploadedFile,
  MigrationWorkbookSlot,
} from "@weld/schemas";
import type { Env } from "../config/config.schema";

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

@Injectable()
export class MigrationDataService implements OnModuleInit {
  private busy = false;
  private readonly dataDir: string;
  private readonly uploadsDir: string;
  private readonly snapshotsDir: string;
  private readonly exportsDir: string;
  private readonly reportPath: string;
  private readonly manifestPath: string;
  private readonly pythonBin: string;
  private readonly migrationRoot: string;

  constructor(private readonly config: ConfigService<Env, true>) {
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

  async runImport(body: MigrationRunRequest): Promise<MigrationRunResult> {
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

    this.busy = true;
    let snapshotId: string | null = null;
    try {
      if (!body.dry_run) {
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
      }

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
      return { dry_run: body.dry_run, snapshot_id: snapshotId, report };
    } finally {
      this.busy = false;
    }
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
      };
      const child = spawn(bin, cmdArgs, {
        env,
        cwd: this.migrationRoot,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (err) => {
        reject(
          new ServiceUnavailableException(
            `Failed to start Python migrator (${bin}): ${err.message}`,
          ),
        );
      });
      child.on("close", (code) => {
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
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        last = trimmed.slice(start, i + 1);
        start = -1;
      }
    }
  }
  return last;
}

export { extractLastJson };

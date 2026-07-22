#!/usr/bin/env node
/**
 * Blocks commits when the dependency tree has known security advisories
 * (moderate+) or packages marked deprecated on the registry.
 * Used by the pre-commit hook — fail closed.
 *
 * Override severity floor: AUDIT_LEVEL=high|moderate|low|info (default: moderate)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const MIN_LEVEL = process.env.AUDIT_LEVEL || "moderate";
const MIN_RANK = SEVERITY_RANK[MIN_LEVEL];

if (MIN_RANK == null) {
  console.error(
    `check:deps: invalid AUDIT_LEVEL=${MIN_LEVEL} (use info|low|moderate|high|critical)`,
  );
  process.exit(2);
}

function runPnpm(args) {
  return spawnSync("pnpm", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function checkAudit() {
  const result = runPnpm(["audit", "--json"]);
  let report;
  try {
    report = JSON.parse(result.stdout || "{}");
  } catch {
    console.error("check:deps: failed to parse `pnpm audit --json` output");
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(1);
  }

  const advisories = report.advisories || {};
  const hits = Object.values(advisories)
    .filter((a) => (SEVERITY_RANK[a.severity] ?? 0) >= MIN_RANK)
    .sort(
      (a, b) =>
        (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
    );

  if (hits.length === 0) {
    console.log(`▸ Audit: no ${MIN_LEVEL}+ advisories`);
    return;
  }

  console.error(
    `✗ Dependency audit failed: ${hits.length} advisory(ies) at ${MIN_LEVEL}+`,
  );
  for (const a of hits) {
    const paths = (a.findings || [])
      .flatMap((f) => f.paths || [])
      .slice(0, 3)
      .join(", ");
    console.error(
      `  [${a.severity}] ${a.module_name}: ${a.title}` +
        (paths ? `\n           via ${paths}` : "") +
        `\n           fix: ${a.recommendation || a.patched_versions || "see advisory"}` +
        (a.url ? `\n           ${a.url}` : ""),
    );
  }
  console.error(
    "\nResolve with version bumps and/or pnpm overrides, then re-run `pnpm run check:deps`.",
  );
  process.exit(1);
}

function checkDeprecated() {
  const lockPath = path.join(ROOT, "pnpm-lock.yaml");
  if (!fs.existsSync(lockPath)) {
    console.error("check:deps: pnpm-lock.yaml not found");
    process.exit(1);
  }

  const lock = fs.readFileSync(lockPath, "utf8");
  const deprecated = [];
  const packageBlock =
    /^ {2}((?:@[^/\s]+\/)?[^@\s]+)@([^:\s]+):\n(?: {4}.+\n)*? {4}deprecated: (.+)$/gm;

  let match;
  while ((match = packageBlock.exec(lock)) !== null) {
    const [, name, version, message] = match;
    deprecated.push({
      name,
      version,
      message: message.replace(/^['"]|['"]$/g, "").trim(),
    });
  }

  if (deprecated.length === 0) {
    console.log("▸ Deprecated: none in lockfile");
    return;
  }

  console.error(`✗ Deprecated packages in lockfile (${deprecated.length}):`);
  for (const d of deprecated) {
    console.error(`  ${d.name}@${d.version}`);
    console.error(`           ${d.message}`);
  }
  console.error(
    "\nUpgrade the parent dependency (or override) so these packages leave the tree.",
  );
  process.exit(1);
}

console.log(
  `▸ Checking dependencies (audit ≥${MIN_LEVEL}, deprecated packages)…`,
);
checkAudit();
checkDeprecated();
console.log("✓ Dependency checks passed");

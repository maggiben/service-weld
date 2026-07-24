#!/usr/bin/env node
/**
 * Enforces ≥80% coverage (lines, branches, functions, statements) for every
 * workspace package via Vitest + @vitest/coverage-v8.
 *
 * Override: COVERAGE_THRESHOLD=80
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THRESHOLD = Number(process.env.COVERAGE_THRESHOLD || 80);

const PACKAGES = [
  { name: "@weld/api", dir: "apps/api" },
  { name: "@weld/web", dir: "apps/web" },
  { name: "@weld/field", dir: "apps/field" },
  { name: "@weld/www", dir: "apps/www" },
  { name: "@weld/domain", dir: "packages/domain" },
  { name: "@weld/schemas", dir: "packages/schemas" },
  { name: "@weld/api-client", dir: "packages/api-client" },
];

function meets(totals) {
  const failed = [];
  for (const metric of ["lines", "branches", "functions", "statements"]) {
    const pct = totals[metric] ?? 0;
    if (pct < THRESHOLD) failed.push(`${metric}=${pct}%`);
  }
  return { ok: failed.length === 0, failed, totals };
}

function runVitestCoverage(pkg) {
  const cwd = path.join(ROOT, pkg.dir);
  const summaryPath = path.join(cwd, "coverage", "coverage-summary.json");
  if (fs.existsSync(summaryPath)) fs.unlinkSync(summaryPath);

  const res = spawnSync("pnpm", ["exec", "vitest", "run", "--coverage"], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  if (!fs.existsSync(summaryPath)) {
    return {
      ok: false,
      reason:
        res.stderr?.slice(-800) ||
        res.stdout?.slice(-800) ||
        `vitest exited ${res.status} (no coverage-summary.json)`,
    };
  }

  if (res.status !== 0) {
    // Vitest exits non-zero on failed tests OR unmet thresholds; prefer summary.
    const total = JSON.parse(fs.readFileSync(summaryPath, "utf8")).total;
    const totals = {
      lines: total.lines.pct,
      branches: total.branches.pct,
      functions: total.functions.pct,
      statements: total.statements.pct,
    };
    const check = meets(totals);
    if (!check.ok) return check;
    return {
      ok: false,
      reason:
        res.stderr?.slice(-600) ||
        res.stdout?.slice(-600) ||
        `vitest exited ${res.status}`,
    };
  }

  const total = JSON.parse(fs.readFileSync(summaryPath, "utf8")).total;
  return meets({
    lines: total.lines.pct,
    branches: total.branches.pct,
    functions: total.functions.pct,
    statements: total.statements.pct,
  });
}

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];

console.log(
  `Coverage threshold: ${THRESHOLD}% (lines/branches/functions/statements)\n`,
);

for (const pkg of PACKAGES) {
  process.stdout.write(`▸ ${pkg.name}… `);
  let result;
  try {
    result = runVitestCoverage(pkg);
  } catch (err) {
    result = { ok: false, reason: String(err) };
  }

  if (result.ok) {
    const t = result.totals;
    const summary = `lines ${t.lines}% · branches ${t.branches}% · funcs ${t.functions}%`;
    console.log(`PASS (${summary})`);
    results.push({ name: pkg.name, ok: true, detail: summary });
  } else {
    const detail = result.failed
      ? `below ${THRESHOLD}%: ${result.failed.join(", ")}`
      : result.reason || "failed";
    console.log(`FAIL — ${detail}`);
    results.push({ name: pkg.name, ok: false, detail });
  }
}

console.log("\n── Summary ──");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(
    `\n❌ Coverage gate failed (${failed.length}/${results.length}). Every service must meet ≥${THRESHOLD}%.`,
  );
  process.exit(1);
}

console.log(`\n✓ All packages meet the ${THRESHOLD}% coverage threshold`);

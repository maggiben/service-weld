#!/usr/bin/env node
/**
 * Enforces ≥80% coverage (lines, branches, functions) for every workspace
 * service/package. Uses Node's built-in --experimental-test-coverage (no c8)
 * and Jest --coverage for @weld/api.
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
  { name: "@weld/api", dir: "apps/api", kind: "jest" },
  { name: "@weld/web", dir: "apps/web", kind: "node" },
  { name: "@weld/field", dir: "apps/field", kind: "node" },
  { name: "@weld/domain", dir: "packages/domain", kind: "node" },
  { name: "@weld/schemas", dir: "packages/schemas", kind: "node" },
  { name: "@weld/api-client", dir: "packages/api-client", kind: "node" },
];

function findTests(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  /** @type {string[]} */
  const found = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (
        ["node_modules", "dist", ".next", "coverage", "build"].includes(
          ent.name,
        )
      ) {
        continue;
      }
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) {
        found.push(p);
      }
    }
  };
  walk(abs);
  return found;
}

/**
 * Parse Node's text coverage table (tap/spec reporters).
 * Aggregates only production sources (excludes *.test.* / *.spec.*).
 */
function parseNodeCoverage(output) {
  const rows = [];
  for (const line of output.split("\n")) {
    // "# file | line % | branch % | funcs % | ..."
    const m = line.match(
      /^#?\s*(.+?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/,
    );
    if (!m) continue;
    const file = m[1].trim();
    if (file === "file" || file === "all files") continue;
    if (/\.(test|spec)\./.test(file)) continue;
    rows.push({
      file,
      lines: Number(m[2]),
      branches: Number(m[3]),
      functions: Number(m[4]),
    });
  }
  if (rows.length === 0) return null;
  const avg = (key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;
  // Prefer the "all files" line if present (more accurate than mean of files)
  const allMatch = output.match(
    /all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/,
  );
  if (allMatch) {
    // Still recompute from source-only rows — Node's "all files" includes tests
    return {
      lines: round2(avg("lines")),
      branches: round2(avg("branches")),
      functions: round2(avg("functions")),
      statements: round2(avg("lines")),
      files: rows.length,
    };
  }
  return {
    lines: round2(avg("lines")),
    branches: round2(avg("branches")),
    functions: round2(avg("functions")),
    statements: round2(avg("lines")),
    files: rows.length,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function meets(totals) {
  const failed = [];
  for (const m of ["lines", "branches", "functions", "statements"]) {
    const pct = totals[m] ?? 0;
    if (pct < THRESHOLD) failed.push(`${m}=${pct}%`);
  }
  return { ok: failed.length === 0, failed, totals };
}

function runNodeCoverage(pkg) {
  const cwd = path.join(ROOT, pkg.dir);
  const tests = findTests(pkg.dir);
  if (tests.length === 0) {
    return {
      ok: false,
      reason: `no *.test.* / *.spec.* files — add tests to reach ${THRESHOLD}%`,
    };
  }
  const rel = tests.map((t) => path.relative(cwd, t));
  const res = spawnSync(
    "node",
    ["--import", "tsx", "--test", "--experimental-test-coverage", ...rel],
    { cwd, encoding: "utf8", env: process.env },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  if (res.status !== 0 && !out.includes("start of coverage report")) {
    return {
      ok: false,
      reason: out.slice(-600) || `tests exited ${res.status}`,
    };
  }
  const totals = parseNodeCoverage(out);
  if (!totals) {
    return { ok: false, reason: "could not parse coverage report" };
  }
  return meets(totals);
}

function runJestCoverage(pkg) {
  const cwd = path.join(ROOT, pkg.dir);
  const unit = findTests(pkg.dir).filter(
    (t) => !t.includes(`${path.sep}test${path.sep}`),
  );
  if (unit.length === 0) {
    return {
      ok: false,
      reason: `no unit *.spec.ts under src/ — add tests to reach ${THRESHOLD}%`,
    };
  }

  const threshold = JSON.stringify({
    global: {
      branches: THRESHOLD,
      functions: THRESHOLD,
      lines: THRESHOLD,
      statements: THRESHOLD,
    },
  });

  const res = spawnSync(
    "pnpm",
    [
      "exec",
      "jest",
      "--coverage",
      "--coverageReporters=json-summary",
      "--coverageReporters=text-summary",
      `--coverageThreshold=${threshold}`,
    ],
    { cwd, encoding: "utf8", env: process.env },
  );

  const summaryPath = path.join(cwd, "coverage", "coverage-summary.json");
  if (fs.existsSync(summaryPath)) {
    const total = JSON.parse(fs.readFileSync(summaryPath, "utf8")).total;
    const totals = {
      lines: total.lines.pct,
      branches: total.branches.pct,
      functions: total.functions.pct,
      statements: total.statements.pct,
    };
    return meets(totals);
  }

  return {
    ok: false,
    reason:
      res.stderr?.slice(-600) ||
      res.stdout?.slice(-600) ||
      `jest exited ${res.status}`,
  };
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
    result = pkg.kind === "jest" ? runJestCoverage(pkg) : runNodeCoverage(pkg);
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

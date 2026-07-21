#!/usr/bin/env node
/**
 * Enforces ≥80% coverage (lines, branches, functions) for every workspace
 * service/package. Uses Node's built-in --experimental-test-coverage (no c8)
 * and Jest --coverage for @weld/api.
 *
 * Override: COVERAGE_THRESHOLD=80
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THRESHOLD = Number(process.env.COVERAGE_THRESHOLD || 80);
const require = createRequire(import.meta.url);

/** Resolve tsx from any workspace package that declares it (pnpm layout). */
function tsxImportSpecifier() {
  const searchRoots = [
    path.join(ROOT, "packages/domain"),
    path.join(ROOT, "packages/schemas"),
    ROOT,
  ];
  for (const root of searchRoots) {
    try {
      return require.resolve("tsx", { paths: [root] });
    } catch {
      /* try next */
    }
  }
  return "tsx";
}

const TSX = tsxImportSpecifier();

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
 * Strip the leading reporter marker (`# ` on Node 20, `ℹ ` on Node 24+).
 * Preserve indentation used by the Node 24+ tree layout.
 */
function stripCoveragePrefix(line) {
  return line.replace(/^(?:#|ℹ) ?/, "");
}

/**
 * Parse Node's text coverage table (tap/spec reporters).
 * Supports Node 20 flat paths and Node 24+ indented tree paths.
 * Aggregates only production sources under `pkgDir` (excludes tests + deps).
 */
function parseNodeCoverage(output, pkgDir) {
  const pkgAbs = path.resolve(ROOT, pkgDir);
  /** @type {{ file: string, lines: number, branches: number, functions: number }[]} */
  const rows = [];
  /** @type {string[]} path segments indexed by tree depth (Node 24+) */
  const tree = [];

  for (const raw of output.split("\n")) {
    const line = stripCoveragePrefix(raw);
    // "file | line % | branch % | funcs % | ..." (metrics may be blank for dirs)
    const m = line.match(
      /^(\s*)(\S.*?)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|/,
    );
    if (!m) continue;

    const indent = m[1].length;
    const label = m[2].trim();
    if (label === "file" || label === "all files") continue;

    // Node 24+ prints a directory tree: each row is one path segment.
    // Flat reports (Node 20) have indent 0 and full relative paths.
    const isTree =
      indent > 0 || (!label.includes("/") && !label.includes("\\"));
    let relFile = label;
    if (isTree) {
      tree.length = indent;
      tree[indent] = label;
      relFile = tree.slice(0, indent + 1).join("/");
      // Directory rows have empty metric cells — skip until a file leaf.
      if (!m[3] || !m[4] || !m[5]) continue;
    } else if (!m[3] || !m[4] || !m[5]) {
      continue;
    }

    if (/\.(test|spec)\./.test(relFile)) continue;

    const abs = path.isAbsolute(relFile)
      ? relFile
      : path.resolve(pkgAbs, relFile);
    if (!abs.startsWith(pkgAbs + path.sep) && abs !== pkgAbs) continue;

    const rel = path.relative(pkgAbs, abs);
    if (
      rel.startsWith("node_modules") ||
      rel.includes(`${path.sep}node_modules${path.sep}`) ||
      rel.startsWith("..")
    ) {
      continue;
    }

    rows.push({
      file: rel,
      lines: Number(m[3]),
      branches: Number(m[4]),
      functions: Number(m[5]),
    });
  }
  if (rows.length === 0) return null;
  const avg = (key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;
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
    [
      "--import",
      TSX,
      "--test",
      "--experimental-test-coverage",
      // Keep coverage scoped to this package's sources (Node 24+ also reports
      // transitive workspace deps unless limited).
      "--test-coverage-include=src/**",
      ...rel,
    ],
    { cwd, encoding: "utf8", env: process.env },
  );
  const out = `${res.stdout || ""}\n${res.stderr || ""}`;
  if (res.status !== 0) {
    return {
      ok: false,
      reason: out.slice(-600) || `tests exited ${res.status}`,
    };
  }
  const totals = parseNodeCoverage(out, pkg.dir);
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

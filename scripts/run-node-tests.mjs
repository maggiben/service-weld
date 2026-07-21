#!/usr/bin/env node
/**
 * Run Node's test runner against discovered *.test.* / *.spec.* files.
 * Avoids shell/`**` glob differences between macOS and Linux CI.
 *
 * Usage (from a package dir):
 *   node ../../scripts/run-node-tests.mjs
 *   node ../../scripts/run-node-tests.mjs --coverage
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cwd = process.cwd();
const coverage = process.argv.includes("--coverage");
const require = createRequire(import.meta.url);

function resolveTsx() {
  for (const root of [cwd, path.join(ROOT, "packages/domain"), ROOT]) {
    try {
      return require.resolve("tsx", { paths: [root] });
    } catch {
      /* try next */
    }
  }
  return "tsx";
}

function findTests(dir) {
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
  if (fs.existsSync(dir)) walk(dir);
  return found.sort();
}

const src = path.join(cwd, "src");
const tests = findTests(src).map((t) => path.relative(cwd, t));
if (tests.length === 0) {
  console.error(`No test files under ${src}`);
  process.exit(1);
}

const args = ["--import", resolveTsx(), "--test"];
if (coverage) args.push("--experimental-test-coverage");
args.push(...tests);

const res = spawnSync("node", args, {
  cwd,
  stdio: "inherit",
  env: process.env,
});
process.exit(res.status ?? 1);

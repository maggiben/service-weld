#!/usr/bin/env node
/**
 * Prettier-check only staged files (fast pre-commit gate).
 */
import { execSync, spawnSync } from "node:child_process";

const staged = execSync("git diff --cached --name-only --diff-filter=ACMR", {
  encoding: "utf8",
})
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .filter((f) =>
    /\.(js|jsx|ts|tsx|mjs|cjs|json|md|yml|yaml|css|html)$/i.test(f),
  );

if (staged.length === 0) {
  console.log("✓ No staged files requiring Prettier");
  process.exit(0);
}

const res = spawnSync("pnpm", ["exec", "prettier", "--check", ...staged], {
  encoding: "utf8",
  stdio: "inherit",
});

if (res.status !== 0) {
  console.error(
    "\n❌ Prettier check failed. Run: pnpm exec prettier --write <files>",
  );
  process.exit(res.status || 1);
}

console.log("✓ Prettier OK on staged files");

#!/usr/bin/env node
/**
 * Points git at .husky/ (no husky npm package required).
 * Safe no-op when .git is missing (e.g. during some CI checkouts).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = path.join(root, ".git");
const hooksDir = path.join(root, ".husky");

if (!fs.existsSync(gitDir)) {
  process.exit(0);
}

if (!fs.existsSync(hooksDir)) {
  console.warn("scripts/install-hooks: .husky/ missing — skip");
  process.exit(0);
}

try {
  execSync("git config core.hooksPath .husky", { cwd: root, stdio: "inherit" });
  // Ensure hook scripts are executable
  for (const name of fs.readdirSync(hooksDir)) {
    const p = path.join(hooksDir, name);
    if (fs.statSync(p).isFile() && !name.startsWith(".")) {
      fs.chmodSync(p, 0o755);
    }
  }
  console.log("✓ git hooks installed (core.hooksPath=.husky)");
} catch (err) {
  console.warn("scripts/install-hooks: could not set hooksPath:", err.message);
  process.exit(0);
}

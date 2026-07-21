#!/usr/bin/env node
/**
 * Blocks staging/committing secrets and credential material.
 * Used by the pre-commit hook — fail closed.
 */
import { execSync } from "node:child_process";
import path from "node:path";

const FORBIDDEN_BASENAMES = new Set([
  ".env",
  "credentials.json",
  "service-account.json",
  "google-services.json",
]);

const FORBIDDEN_PATTERNS = [
  /^\.env\./i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.p8$/i,
  /\.keystore$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /^id_dsa/i,
  /\.secret$/i,
  /firebase-adminsdk/i,
  /service-account.*\.json$/i,
];

const ALLOWED_BASENAMES = new Set([".env.example"]);

function stagedFiles() {
  const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function isForbidden(filePath) {
  const base = path.basename(filePath);
  if (ALLOWED_BASENAMES.has(base)) return false;
  if (FORBIDDEN_BASENAMES.has(base)) return true;
  if (base.startsWith(".env") && base !== ".env.example") return true;
  return FORBIDDEN_PATTERNS.some((re) => re.test(base) || re.test(filePath));
}

const bad = stagedFiles().filter(isForbidden);
if (bad.length > 0) {
  console.error("❌ Refusing to commit secret / credential files:");
  for (const f of bad) console.error(`   - ${f}`);
  console.error(
    "\nRemove them from the index (git rm --cached <file>) and keep them local only.",
  );
  process.exit(1);
}

console.log("✓ No secret/credential files staged");

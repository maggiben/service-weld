#!/usr/bin/env node
/**
 * Apply baseline `schema.sql` (same role as `psql -f schema.sql`).
 * Uses the `pg` package so a local `psql` binary is not required.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const schemaPath = path.join(rootDir, "schema.sql");

/** Load repo-root `.env` into `process.env` without overriding existing vars. */
function loadRootEnv() {
  const envPath = path.join(rootDir, ".env");
  let raw;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return;
    }
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadRootEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required (set it or add it to .env)");
    process.exit(1);
  }

  const sql = await readFile(schemaPath, "utf8");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log("applying schema.sql");
    await client.query(sql);
    console.log("Baseline schema loaded!");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

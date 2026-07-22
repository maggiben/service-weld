#!/usr/bin/env node
/**
 * Apply additive `*.up.sql` migrations in order (same as CI).
 *
 * Why not raw `node-pg-migrate`? This repo's dual files are named
 * `NNNN_name.up.sql` / `NNNN_name.down.sql`. Default node-pg-migrate treats
 * every `.sql` file as an UP migration, so `.down.sql` would run on `up`
 * and destroy data. CI only applies `*.up.sql`; this script mirrors that.
 */
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsDir = path.join(rootDir, "db/migrations");

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

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".up.sql"))
    .sort();

  if (files.length === 0) {
    console.log("No *.up.sql migrations found.");
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await readFile(fullPath, "utf8");
      console.log(`applying ${file}`);
      await client.query(sql);
    }
    console.log("Migrations complete!");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

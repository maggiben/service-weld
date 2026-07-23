#!/usr/bin/env node
/**
 * Enforces identifier length ≥ MIN (default 2) for value bindings in TS/JS.
 * Used by the pre-commit hook — fail closed.
 *
 * Override: ID_LENGTH_MIN=2
 * Allowed short placeholder: `_` only (intentionally unused).
 *
 * Checks: locals, parameters, catch bindings, value imports, function names.
 * Skips: type-only constructs (type params, aliases, interfaces, type-only imports).
 *
 * Two-letter names (`id`, `db`, `qb`, `eb`, …) are allowed. Single-letter
 * bindings are not — prefer a name that reflects the value in context.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN = Number(process.env.ID_LENGTH_MIN || 2);
const ALLOW = new Set(["_"]);
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "coverage",
  ".next",
  "build",
  "out",
]);
const SCAN_ROOTS = ["apps", "packages"];

if (!Number.isFinite(MIN) || MIN < 1) {
  console.error(
    `check:id-length: invalid ID_LENGTH_MIN=${process.env.ID_LENGTH_MIN}`,
  );
  process.exit(2);
}

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walkDir(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") && ent.name !== ".husky") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walkDir(full, out);
    } else if (
      EXTS.has(path.extname(ent.name)) &&
      !ent.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {string} name
 */
function isTooShort(name) {
  return name.length > 0 && name.length < MIN && !ALLOW.has(name);
}

/**
 * @param {ts.Identifier} node
 */
function isValueBindingName(node) {
  const parent = node.parent;
  if (!parent) return false;

  if (ts.isTypeParameterDeclaration(parent) && parent.name === node)
    return false;
  if (ts.isTypeAliasDeclaration(parent) && parent.name === node) return false;
  if (ts.isInterfaceDeclaration(parent) && parent.name === node) return false;

  if (ts.isImportSpecifier(parent) && parent.name === node) {
    if (parent.isTypeOnly) return false;
    const clause = parent.parent?.parent;
    if (clause && ts.isImportClause(clause) && clause.isTypeOnly) return false;
    return true;
  }
  if (ts.isImportClause(parent) && parent.name === node)
    return !parent.isTypeOnly;
  if (ts.isNamespaceImport(parent) && parent.name === node) {
    const clause = parent.parent;
    return !(clause && ts.isImportClause(clause) && clause.isTypeOnly);
  }
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  if (ts.isFunctionDeclaration(parent) && parent.name === node && parent.body) {
    return true;
  }
  if (ts.isFunctionExpression(parent) && parent.name === node) return true;
  if (ts.isClassDeclaration(parent) && parent.name === node) return true;
  return false;
}

/**
 * @param {string} filePath
 */
function scriptKindFor(filePath) {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
    return ts.ScriptKind.TSX;
  }
  if (
    filePath.endsWith(".mjs") ||
    filePath.endsWith(".cjs") ||
    filePath.endsWith(".js")
  ) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

/**
 * @param {string} filePath
 */
function findViolations(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  /** @type {{ file: string, line: number, col: number, name: string }[]} */
  const hits = [];

  /** @param {ts.Node} node */
  function visit(node) {
    if (
      ts.isIdentifier(node) &&
      isValueBindingName(node) &&
      isTooShort(node.text)
    ) {
      const { line, character } = sf.getLineAndCharacterOfPosition(
        node.getStart(sf),
      );
      hits.push({
        file: path.relative(ROOT, filePath),
        line: line + 1,
        col: character + 1,
        name: node.text,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return hits;
}

const files = SCAN_ROOTS.flatMap((rel) => walkDir(path.join(ROOT, rel)));
const violations = files.flatMap(findViolations);

if (violations.length > 0) {
  console.error(
    `❌ Identifier length: ${violations.length} binding(s) shorter than ${MIN} character(s):\n`,
  );
  const max = 80;
  for (const v of violations.slice(0, max)) {
    console.error(`   ${v.file}:${v.line}:${v.col}  \`${v.name}\``);
  }
  if (violations.length > max) {
    console.error(`   … and ${violations.length - max} more`);
  }
  console.error(
    `\nRename single-letter locals/params to ≥${MIN} characters reflecting their meaning (e.g. \`event\`, \`row\`, \`state\`). Two-letter names like \`id\` / \`db\` are fine. Only \`_\` is allowed as a short unused placeholder.`,
  );
  console.error("Fix helper: node scripts/fix-id-length.mjs");
  process.exit(1);
}

console.log(`✓ Identifier length: all value bindings are ≥${MIN} characters`);

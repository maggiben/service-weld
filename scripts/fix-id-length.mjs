#!/usr/bin/env node
/**
 * Renames single-letter value bindings using the TypeScript language service.
 * Default ID_LENGTH_MIN=2 — two-letter names (`id`, `db`, …) are left alone.
 *
 * Names are chosen from context (not inventing database2/state3). Uniqueness is
 * checked only within the enclosing function scope so each method can reuse `db`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN = Number(process.env.ID_LENGTH_MIN || 2);
const ALLOW = new Set(["_"]);

const TSCONFIGS = [
  "apps/api/tsconfig.json",
  "apps/web/tsconfig.json",
  "apps/field/tsconfig.json",
  "apps/www/tsconfig.json",
  "packages/domain/tsconfig.json",
  "packages/schemas/tsconfig.json",
  "packages/api-client/tsconfig.json",
];

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
 * @param {ts.Node} node
 */
function enclosingFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur) ||
      ts.isConstructorDeclaration(cur) ||
      ts.isGetAccessorDeclaration(cur) ||
      ts.isSetAccessorDeclaration(cur)
    ) {
      return cur;
    }
    if (ts.isSourceFile(cur)) return cur;
    cur = cur.parent;
  }
  return node.getSourceFile();
}

/**
 * Names already bound in the same function scope (declaration sites only).
 * @param {ts.Node} scope
 */
function namesInScope(scope) {
  const used = new Set();
  /** @param {ts.Node} node */
  function visit(node) {
    // Do not descend into nested functions — they have their own scopes.
    if (
      node !== scope &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node))
    ) {
      if (ts.isFunctionDeclaration(node) && node.name) used.add(node.name.text);
      return;
    }
    if (ts.isIdentifier(node) && isValueBindingName(node)) {
      used.add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(scope);
  return used;
}

/**
 * @param {ts.Identifier} node
 * @param {ts.SourceFile} sf
 */
function suggestName(node, sf) {
  const old = node.text;
  const parent = node.parent;
  const textAround = sf.text.slice(
    Math.max(0, node.getStart(sf) - 80),
    Math.min(sf.text.length, node.end + 120),
  );

  if (
    parent &&
    ts.isVariableDeclaration(parent) &&
    parent.parent &&
    ts.isCatchClause(parent.parent)
  ) {
    return "error";
  }

  if (parent && ts.isBindingElement(parent)) {
    let n = parent.parent;
    while (n && !ts.isVariableDeclaration(n)) n = n.parent;
    if (
      n &&
      ts.isVariableDeclaration(n) &&
      n.initializer &&
      /useTranslation/.test(n.initializer.getText(sf))
    ) {
      return "translate";
    }
  }

  if (parent && ts.isImportSpecifier(parent)) {
    if (old === "z") return "zod";
    return `${old}Import`;
  }

  // Zustand / store selectors: (s) => s.foo
  if (
    /use\w+Store\s*\(\s*\(\s*$/.test(
      sf.text.slice(Math.max(0, node.getStart(sf) - 40), node.getStart(sf)),
    ) ||
    (parent &&
      ts.isParameter(parent) &&
      /Store\s*\(\s*\(/.test(textAround) &&
      old === "s")
  ) {
    return "state";
  }
  if (
    old === "s" &&
    /\.getState\b|useUiStore|useSessionStore|useOutboxStore|useNotificationStore|set\(\s*\(s\)/.test(
      textAround,
    )
  ) {
    return "state";
  }

  // React events
  if (
    old === "e" &&
    (/\.target\b|onChange|onClick|onSubmit|React\.(Change|Mouse|Form)Event|ChangeEvent/.test(
      textAround,
    ) ||
      (parent &&
        ts.isParameter(parent) &&
        parent.type &&
        /Event/.test(parent.type.getText(sf))))
  ) {
    return "event";
  }

  // Array callbacks — prefer name from the collection when obvious
  if (parent && ts.isParameter(parent)) {
    const fn = parent.parent;
    if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
      const call = fn.parent;
      if (
        call &&
        ts.isCallExpression(call) &&
        ts.isPropertyAccessExpression(call.expression)
      ) {
        const method = call.expression.name.text;
        const recv = call.expression.expression.getText(sf);
        if (
          [
            "map",
            "filter",
            "find",
            "findIndex",
            "forEach",
            "some",
            "every",
            "flatMap",
          ].includes(method)
        ) {
          if (/row/i.test(recv)) return "row";
          if (/rate/i.test(recv)) return "rate";
          if (/item/i.test(recv)) return "item";
          if (/member/i.test(recv)) return "member";
          if (/territor/i.test(recv)) return "territory";
          if (/localit/i.test(recv)) return "locality";
          if (/client/i.test(recv)) return "client";
          if (/cylinder/i.test(recv)) return "cylinder";
          if (/movement/i.test(recv)) return "movement";
          if (/entr/i.test(recv)) return "entry";
          if (/gas/i.test(recv) || recv === "GASES") return "gas";
          if (/type/i.test(recv) || recv === "TYPES" || recv === "ACTIONS")
            return "option";
          if (/candidate/i.test(recv)) return "candidate";
          if (method === "sort" || (parent.parent && false)) {
            /* handled below */
          }
          if (old === "r") return "row";
          if (old === "m") return "member";
          if (old === "c") return "item";
          if (old === "x") return "item";
          if (old === "g") return "gas";
          if (old === "t") return "territory";
          if (old === "l") return "locality";
          if (old === "v") return "value";
          if (old === "p") return "part";
          return "item";
        }
        if (method === "sort" && ts.isParameter(parent)) {
          const params = fn.parameters;
          if (params[0] === parent) return "left";
          if (params[1] === parent) return "right";
        }
      }
    }
  }

  // sort (a, b)
  if (old === "a") return "left";
  if (old === "b") return "right";

  if (old === "i") return "index";
  if (old === "j") return "inner";
  if (old === "k") return "key";
  if (old === "v") return "value";
  if (old === "e") return "event";
  if (old === "s") return "state";
  if (old === "t") return "translate";
  if (old === "r") return "row";
  if (old === "n") return "num";
  if (old === "d") return "data";
  if (old === "f") return "flag";
  if (old === "p") return "part";
  if (old === "m") return "member";
  if (old === "c") return "item";
  if (old === "o") return "obj";
  if (old === "q") return "query";
  if (old === "u") return "unit";
  if (old === "w") return "wrap";
  if (old === "x") return "item";
  if (old === "y") return "year";
  if (old === "z") return "zod";
  if (old === "g") return "gas";
  if (old === "h") return "head";
  if (old === "l") return "loc";

  if (old.startsWith("_")) return "_";
  return `${old}Val`;
}

/**
 * Prefer contextual names; on collision in the same scope, pick a second
 * meaningful variant — never name+digit.
 * @param {string} preferred
 * @param {Set<string>} used
 * @param {string} old
 */
function uniqueName(preferred, used, old) {
  const fallbacks = {
    state: ["store", "slice", "session"],
    event: ["evt", "change", "input"],
    error: ["err", "fault", "cause"],
    translate: ["tFn", "i18n", "label"],
    row: ["record", "entry", "line"],
    item: ["element", "node", "piece"],
    left: ["first", "prev"],
    right: ["second", "next"],
    value: ["val", "current"],
    key: ["name", "token"],
    index: ["idx", "pos", "offset"],
    member: ["part", "unit"],
    gas: ["code", "fuel"],
    territory: ["region", "area"],
    locality: ["place", "town"],
    zod: ["zSchema", "schema"],
  };

  if (!used.has(preferred) && preferred.length >= MIN) return preferred;
  for (const alt of fallbacks[preferred] || []) {
    if (!used.has(alt) && alt.length >= MIN) return alt;
  }
  // Last resort: prefix with role of the old letter, still no digits.
  const last = `${preferred}_${old}`;
  if (!used.has(last)) return last;
  return `${preferred}_x`;
}

/**
 * @param {ts.SourceFile} sf
 */
function findShortDecls(sf) {
  /** @type {ts.Identifier[]} */
  const decls = [];
  /** @param {ts.Node} node */
  function visit(node) {
    if (
      ts.isIdentifier(node) &&
      isValueBindingName(node) &&
      isTooShort(node.text)
    ) {
      decls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return decls;
}

/**
 * @param {Map<string, string>} files
 * @param {Map<string, number>} versions
 * @param {ts.LanguageService} ls
 * @param {string} fileName
 * @param {number} position
 * @param {string} newName
 */
function applyRename(files, versions, ls, fileName, position, newName) {
  const locs = ls.findRenameLocations(fileName, position, false, false, true);
  if (!locs || locs.length === 0) return false;

  /** @type {Map<string, { start: number, end: number, text: string }[]>} */
  const byFile = new Map();
  for (const loc of locs) {
    const prefix = loc.prefixText || "";
    const suffix = loc.suffixText || "";
    const start = loc.textSpan.start;
    const end = start + loc.textSpan.length;
    const list = byFile.get(loc.fileName) || [];
    list.push({ start, end, text: prefix + newName + suffix });
    byFile.set(loc.fileName, list);
  }

  for (const [fn, edits] of byFile) {
    let text = files.get(fn);
    if (text == null) {
      text = fs.readFileSync(fn, "utf8");
      files.set(fn, text);
      versions.set(fn, 0);
    }
    edits.sort((left, right) => right.start - left.start);
    for (const edit of edits) {
      text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    }
    files.set(fn, text);
    versions.set(fn, (versions.get(fn) || 0) + 1);
  }
  return true;
}

/**
 * Also fix test files excluded from tsconfig.
 * @param {string} absDir
 * @param {(file: string) => boolean} filter
 */
function walkTests(absDir, filter, out = []) {
  if (!fs.existsSync(absDir)) return out;
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      if (["node_modules", "dist", ".next", "coverage"].includes(ent.name))
        continue;
      walkTests(full, filter, out);
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * File-local rename for tests (no program) — still scope-aware.
 * @param {string} filePath
 */
function fixFileLocal(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  let changed = false;
  for (let round = 0; round < 200; round++) {
    const kind = filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    const decls = findShortDecls(sf);
    if (decls.length === 0) break;
    const node = decls[0];
    const scope = enclosingFunction(node);
    const used = namesInScope(scope);
    used.delete(node.text);
    const next = uniqueName(suggestName(node, sf), used, node.text);

    // Replace this binding + same-name refs inside scope (skip property names).
    const old = node.text;
    /** @type {{ start: number, end: number, text: string }[]} */
    const edits = [];
    const seen = new Set();
    /** @param {ts.Node} n */
    function walk(n) {
      if (
        n !== scope &&
        (ts.isFunctionDeclaration(n) ||
          ts.isFunctionExpression(n) ||
          ts.isArrowFunction(n) ||
          ts.isMethodDeclaration(n))
      ) {
        return;
      }
      if (ts.isIdentifier(n) && n.text === old) {
        if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) {
          ts.forEachChild(n, walk);
          return;
        }
        if (
          ts.isPropertyAssignment(n.parent) &&
          n.parent.name === n &&
          !ts.isShorthandPropertyAssignment(n.parent)
        ) {
          ts.forEachChild(n, walk);
          return;
        }
        let replacement = next;
        if (
          ts.isBindingElement(n.parent) &&
          n.parent.name === n &&
          !n.parent.propertyName
        ) {
          replacement = `${old}: ${next}`;
        } else if (
          ts.isShorthandPropertyAssignment(n.parent) &&
          n.parent.name === n
        ) {
          replacement = `${old}: ${next}`;
        } else if (
          ts.isImportSpecifier(n.parent) &&
          n.parent.name === n &&
          !n.parent.propertyName
        ) {
          replacement = `${old} as ${next}`;
        }
        const start = n.getStart(sf);
        if (!seen.has(start)) {
          seen.add(start);
          edits.push({ start, end: n.end, text: replacement });
        }
      }
      ts.forEachChild(n, walk);
    }
    walk(scope);
    if (edits.length === 0) break;
    edits.sort((left, right) => right.start - left.start);
    for (const edit of edits) {
      text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    }
    changed = true;
  }
  if (changed) fs.writeFileSync(filePath, text);
  return changed;
}

/**
 * @param {string} tsconfigRel
 */
function fixPackage(tsconfigRel) {
  const configPath = path.join(ROOT, tsconfigRel);
  if (!fs.existsSync(configPath)) {
    console.warn(`skip missing ${tsconfigRel}`);
    return { renames: 0, writes: 0 };
  }
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    console.error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    );
    process.exit(1);
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );

  /** @type {Map<string, string>} */
  const files = new Map();
  /** @type {Map<string, number>} */
  const versions = new Map();

  for (const fn of parsed.fileNames) {
    if (fn.includes(`${path.sep}node_modules${path.sep}`)) continue;
    files.set(fn, fs.readFileSync(fn, "utf8"));
    versions.set(fn, 0);
  }

  const host = {
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: (fn) => String(versions.get(fn) ?? 0),
    getScriptSnapshot: (fn) => {
      const text = files.get(fn);
      if (text == null) return undefined;
      return ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => path.dirname(configPath),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const ls = ts.createLanguageService(host);
  let renames = 0;

  for (let guard = 0; guard < 5000; guard++) {
    let found = null;
    for (const fn of files.keys()) {
      const text = files.get(fn);
      if (text == null) continue;
      const sf = ts.createSourceFile(
        fn,
        text,
        ts.ScriptTarget.Latest,
        true,
        fn.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const decls = findShortDecls(sf);
      if (decls.length === 0) continue;
      const node = decls[0];
      const scope = enclosingFunction(node);
      const used = namesInScope(scope);
      used.delete(node.text);
      const next = uniqueName(suggestName(node, sf), used, node.text);
      found = { fn, pos: node.getStart(sf), next, old: node.text };
      break;
    }
    if (!found) break;
    const ok = applyRename(
      files,
      versions,
      ls,
      found.fn,
      found.pos,
      found.next,
    );
    if (!ok) {
      console.warn(
        `  could not rename \`${found.old}\` → \`${found.next}\` in ${path.relative(ROOT, found.fn)}`,
      );
      // Skip by rewriting only the declaration token so we progress.
      const text = files.get(found.fn);
      if (text == null) break;
      const sf = ts.createSourceFile(
        found.fn,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const decls = findShortDecls(sf);
      if (!decls.length) break;
      const node = decls[0];
      files.set(
        found.fn,
        text.slice(0, node.getStart(sf)) + found.next + text.slice(node.end),
      );
      versions.set(found.fn, (versions.get(found.fn) || 0) + 1);
    }
    renames += 1;
    if (renames % 100 === 0) process.stdout.write(`  … ${renames} renames\n`);
  }

  let writes = 0;
  for (const [fn, text] of files) {
    const onDisk = fs.readFileSync(fn, "utf8");
    if (text !== onDisk) {
      fs.writeFileSync(fn, text);
      writes += 1;
    }
  }
  ls.dispose();
  return { renames, writes };
}

let totalRenames = 0;
let totalWrites = 0;
for (const cfg of TSCONFIGS) {
  process.stdout.write(`▸ ${cfg}…\n`);
  const { renames, writes } = fixPackage(cfg);
  totalRenames += renames;
  totalWrites += writes;
  console.log(`  ${renames} renames, ${writes} files written`);
}

console.log("▸ test files excluded from tsconfig…");
const testFiles = [
  ...walkTests(path.join(ROOT, "apps"), (file) => file.endsWith(".test.ts")),
  ...walkTests(path.join(ROOT, "packages"), (file) =>
    file.endsWith(".test.ts"),
  ),
];
let testWrites = 0;
for (const file of testFiles) {
  if (fixFileLocal(file)) {
    testWrites += 1;
    console.log(`  updated ${path.relative(ROOT, file)}`);
  }
}

console.log(
  `\nDone. ${totalRenames} renames, ${totalWrites} program files, ${testWrites} test files.`,
);
console.log("Re-run: node scripts/check-id-length.mjs");

# ESLint

Used for **IDE squiggles** and an optional CLI check. Prettier only formats —
it cannot flag single-letter identifiers.

## What is enforced

Rule `id-length` (min **2**, exception `_`, `properties: "never"`), matching
`pnpm run check:id-length` / the pre-commit hook (`012` R8 / D-16):

- No single-letter locals/params (`e`, `t`, `s`, …)
- Two-letter names OK (`id`, `db`, `qb`, `eb`)
- Object property keys are not checked

Config: `eslint.config.mjs` (flat). Packages: `eslint`, `typescript-eslint`,
`@eslint/js` (root `devDependencies`).

## IDE (Cursor / VS Code)

1. Install the **ESLint** extension (`dbaeumer.vscode-eslint`) — recommended in
   `.vscode/extensions.json`.
2. Workspace settings in `.vscode/settings.json` enable flat config for TS/TSX.
3. Open a file under `apps/` or `packages/` — single-letter bindings should
   underline in red.

Reload the window if diagnostics do not appear after install (`Developer:
Reload Window`).

## CLI

```
pnpm run lint:eslint
```

Root `pnpm lint` still runs Prettier + typecheck; add `lint:eslint` there when
you want it in the default lint gate. Pre-commit continues to use
`check:id-length` (AST scan) so commits stay gated even without the ESLint
extension.

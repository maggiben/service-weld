# Agent instructions (Weld)

Authoritative implementation specs live in `specs/` (start with `000-project-overview.md`). Architecture decisions: `specs/DECISIONS.md`. Day-to-day setup: `docs/DEVELOPMENT.md`.

## Engineering principles — SOLID + DRY

Apply **SOLID** and **DRY** on every change (`docs/DEVELOPMENT.md` § Engineering principles, `sdd.md` NFR-10):

- **DRY:** one source of truth — shared domain in `packages/domain`, shared Zod in `packages/schemas`, shared view/form helpers in feature `*Logic.ts` with tests. Do not copy-paste identical logic across drawers/pages/services.
- **SOLID:** single-responsibility modules; extend rather than bloat core paths; honor contracts; keep interfaces/schemas narrow; keep business invariants in domain/DB, not only in UI/controllers.

Prefer extracting real duplication over speculative abstraction.

## Quality gates — never commit without checks

Local hooks and CI enforce the same rules. **Do not create a git commit until these pass. Do not skip hooks (`--no-verify`) unless the user explicitly requests a bypass.**

| When          | Required checks                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Before commit | `pnpm run check:secrets`, `pnpm run check:deps`, `pnpm run check:id-length`, Prettier (staged / `format:check`), `pnpm run typecheck` |
| Before push   | `pnpm run test:coverage` — **≥80%** lines/branches/functions/statements on **every** workspace package                                |

Hooks: `.husky/pre-commit`, `.husky/pre-push`. Coverage script: `scripts/check-coverage.mjs` (Vitest + `@vitest/coverage-v8`; default threshold `80`). Deps script: `scripts/check-deps.mjs`. Identifier length: `scripts/check-id-length.mjs` (min 2). Specs: `010` R0 / R9–R10, `012` R8, D-16.

When the user asks you to commit, run the checks first (or rely on hooks actually executing), fix failures, then commit — never commit hoping CI will catch it later.

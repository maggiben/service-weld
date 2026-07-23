# Agent instructions (Weld)

Authoritative implementation specs live in `specs/` (start with `000-project-overview.md`). Architecture decisions: `specs/DECISIONS.md`. Day-to-day setup: `docs/DEVELOPMENT.md`.

## Quality gates — never commit without checks

Local hooks and CI enforce the same rules. **Do not create a git commit until these pass. Do not skip hooks (`--no-verify`) unless the user explicitly requests a bypass.**

| When          | Required checks                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Before commit | `pnpm run check:secrets`, `pnpm run check:deps`, `pnpm run check:id-length`, Prettier (staged / `format:check`), `pnpm run typecheck` |
| Before push   | `pnpm run test:coverage` — **≥80%** lines/branches/functions/statements on **every** workspace package                                |

Hooks: `.husky/pre-commit`, `.husky/pre-push`. Coverage script: `scripts/check-coverage.mjs` (default threshold `80`). Deps script: `scripts/check-deps.mjs`. Identifier length: `scripts/check-id-length.mjs` (min 2). Specs: `010` R9–R10, `012` R8, D-16.

When the user asks you to commit, run the checks first (or rely on hooks actually executing), fix failures, then commit — never commit hoping CI will catch it later.

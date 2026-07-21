# ESLint — Phase 1 placeholder

ESLint packages (`eslint`, `typescript-eslint`) are deferred until the next
`pnpm install` can write to the package store without sandbox EPERM issues.

Until then:

- `pnpm lint` remains a no-op stub per package
- Prefer `pnpm typecheck` + Prettier (`pnpm format:check`) as the local gate
- CI already runs typecheck + build

When wiring for real, add at the workspace root:

```js
// eslint.config.js (flat config)
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**"] },
);
```

and set each package's `"lint": "eslint ."` script.

import tseslint from "typescript-eslint";

/**
 * IDE + CLI lint. Scoped to identifier length for now (matches
 * `pnpm run check:id-length` / pre-commit): no single-letter value names.
 * Prettier remains the formatter — it cannot enforce this rule.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "migration/**",
      "db/**",
    ],
  },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Align with scripts/check-id-length.mjs (min 2; `_` unused ok).
      // `properties: "never"` skips object keys like `{ id: 1 }`.
      "id-length": [
        "error",
        {
          min: 2,
          exceptions: ["_"],
          properties: "never",
        },
      ],
    },
  },
);

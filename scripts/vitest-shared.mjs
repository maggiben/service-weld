import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Shared Vitest defaults. Call from a package's vitest.config.ts via defineConfig().
 * Do not set `root` here — Vitest resolves it from the config file location.
 */
export function weldVitestConfig(options = {}) {
  const threshold = Number(process.env.COVERAGE_THRESHOLD || 80);

  return {
    test: {
      globals: true,
      environment: "node",
      include: options.include ?? ["src/**/*.{test,spec}.ts"],
      exclude: options.exclude ?? [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
      ],
      coverage: {
        provider: "v8",
        all: options.coverageAll ?? false,
        reporter: ["text-summary", "json-summary"],
        include: options.coverageInclude ?? ["src/**/*.{ts,tsx}"],
        exclude: options.coverageExclude ?? [
          "src/**/*.{test,spec}.ts",
          "src/**/*.d.ts",
          "**/node_modules/**",
          "**/dist/**",
        ],
        thresholds: {
          lines: threshold,
          branches: threshold,
          functions: threshold,
          statements: threshold,
        },
      },
      ...(options.test ?? {}),
    },
    resolve: {
      alias: {
        "@weld/domain": path.join(ROOT, "packages/domain/src/index.ts"),
        "@weld/schemas": path.join(ROOT, "packages/schemas/src/index.ts"),
        "@weld/api-client": path.join(ROOT, "packages/api-client/src/index.ts"),
        ...(options.alias ?? {}),
      },
    },
  };
}

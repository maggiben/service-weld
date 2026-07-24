/** Ambient types for `scripts/vitest-shared.mjs` (imported by package vitest configs). */
declare module "*vitest-shared.mjs" {
  export function weldVitestConfig(options?: {
    include?: string[];
    exclude?: string[];
    coverageAll?: boolean;
    coverageInclude?: string[];
    coverageExclude?: string[];
    alias?: Record<string, string>;
    test?: Record<string, unknown>;
  }): {
    test: Record<string, unknown>;
    resolve: { alias: Record<string, string> };
  };
}

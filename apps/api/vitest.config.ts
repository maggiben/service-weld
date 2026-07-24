import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { weldVitestConfig } from "../../scripts/vitest-shared.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  weldVitestConfig({
    include: ["src/**/*.spec.ts"],
    coverageAll: true,
    coverageInclude: [
      "src/**/*.service.ts",
      "src/arca/crypto/**/*.ts",
      "src/arca/certificate/**/*.ts",
      "src/arca/csr/**/*.ts",
      "src/auth/password.ts",
      "src/auth/capabilities.ts",
      "src/auth/principal.ts",
      "src/auth/guards/capabilities.guard.ts",
      "src/auth/guards/territory-scope.guard.ts",
      "src/common/pagination/**/*.ts",
      "src/common/errors/**/*.ts",
      "src/config/config.schema.ts",
      "src/health/health.controller.ts",
      "src/database/transaction.context.ts",
    ],
    coverageExclude: [
      "src/**/*.spec.ts",
      "src/migration-data/**",
      "**/node_modules/**",
      "**/dist/**",
    ],
    alias: {
      "@arcasdk/core": path.join(
        root,
        "node_modules/@arcasdk/core/lib/index.js",
      ),
      "@peculiar/x509": path.join(
        root,
        "node_modules/@peculiar/x509/build/x509.cjs.js",
      ),
    },
  }),
);

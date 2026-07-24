import { defineConfig } from "vitest/config";
import { weldVitestConfig } from "../../scripts/vitest-shared.mjs";

export default defineConfig(
  weldVitestConfig({
    include: ["test/**/*.e2e-spec.ts"],
  }),
);

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { weldVitestConfig } from "../../scripts/vitest-shared.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  weldVitestConfig({
    alias: {
      "@": path.join(root, "src"),
    },
  }),
);

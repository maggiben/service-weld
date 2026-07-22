import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(appDir, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@weld/schemas", "@weld/api-client", "@weld/domain"],
  turbopack: {
    // Workspace packages live under packages/; keep resolution rooted at the monorepo.
    root: monorepoRoot,
  },
};

export default nextConfig;

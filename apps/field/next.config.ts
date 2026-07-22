import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(appDir, "../..");

/**
 * Field app — Next.js 16 App Router (D-12).
 * Phase 6: offline outbox (IndexedDB) + background drain on reconnect.
 * Full service-worker caching can be layered with Serwist later.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@weld/schemas", "@weld/api-client"],
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;

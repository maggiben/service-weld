import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(appDir, "../..");

/**
 * Public marketing site (serviceweld.com) — Next.js App Router.
 * Intentionally decoupled from @weld/web / API packages so designers can
 * iterate without the back-office app (spec 013).
 */
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;

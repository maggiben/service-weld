#!/usr/bin/env bash
# Fallback when pnpm cannot write to the global store (e.g. Cursor sandbox).
# Prefer: pnpm --filter @weld/api add @arcasdk/core @peculiar/x509
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p vendor/arca-install .npm-cache
npm install @arcasdk/core@2.0.0 @peculiar/x509@1.14.0 \
  --prefix ./vendor/arca-install \
  --cache ./.npm-cache
mkdir -p apps/api/node_modules
ln -sfn ../../../vendor/arca-install/node_modules/@arcasdk apps/api/node_modules/@arcasdk
ln -sfn ../../../vendor/arca-install/node_modules/@peculiar apps/api/node_modules/@peculiar
echo "Linked @arcasdk/core and @peculiar/x509 into apps/api/node_modules"

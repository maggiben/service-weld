# API image (012 core). Build from monorepo root:
#   docker build -f apps/api/Dockerfile -t weld-api .
#
# Railway: set RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
# Mount a volume at /data/migration so Sync snapshots survive redeploys.
FROM node:24.18-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/domain packages/domain
COPY packages/schemas packages/schemas
COPY apps/api apps/api
RUN pnpm --filter @weld/schemas build \
 && pnpm --filter @weld/domain build \
 && pnpm --filter @weld/api build

# Keep the pnpm workspace layout so package symlinks resolve at runtime.
# Python + pg_dump enable online admin migration-data (011 importer).
FROM node:24.18-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV MIGRATION_DATA_DIR=/data/migration
ENV MIGRATION_PACKAGE_DIR=/app/migration
ENV PYTHONPATH=/app/migration
ENV PYTHON_BIN=/opt/weld-migration-venv/bin/python
COPY migration/requirements.txt /tmp/migration-requirements.txt
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-venv \
      postgresql-client \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/weld-migration-venv \
 && /opt/weld-migration-venv/bin/pip install --no-cache-dir -r /tmp/migration-requirements.txt \
 && mkdir -p /data/migration \
 && rm /tmp/migration-requirements.txt
ENV PATH="/opt/weld-migration-venv/bin:${PATH}"
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY migration/weld_migration /app/migration/weld_migration
COPY migration/requirements.txt /app/migration/requirements.txt
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/apps/api/src/main.js"]

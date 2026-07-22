# Marketing site image (serviceweld.com). Build from monorepo root:
#   docker build -f apps/www/Dockerfile \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://serviceweld.com \
#     --build-arg NEXT_PUBLIC_APP_URL=https://app.serviceweld.com \
#     -t weld-www .
#
# Railway: set RAILWAY_DOCKERFILE_PATH=apps/www/Dockerfile and the NEXT_PUBLIC_* vars.
FROM node:24.18-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
# Workspace package.json stubs so `pnpm install --frozen-lockfile` resolves the lockfile.
COPY apps/www/package.json apps/www/
COPY apps/web/package.json apps/web/
COPY apps/field/package.json apps/field/
COPY apps/api/package.json apps/api/
COPY packages/api-client/package.json packages/api-client/
COPY packages/domain/package.json packages/domain/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile --filter @weld/www...

FROM deps AS build
ARG NEXT_PUBLIC_SITE_URL=https://serviceweld.com
ARG NEXT_PUBLIC_APP_URL=https://app.serviceweld.com
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
COPY apps/www apps/www
RUN pnpm --filter @weld/www build

FROM node:24.18-alpine AS runner
ARG PORT=3003
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${PORT}
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/www/public ./apps/www/public
COPY --from=build /app/apps/www/.next/standalone ./
COPY --from=build /app/apps/www/.next/static ./apps/www/.next/static
EXPOSE ${PORT}
CMD ["sh", "-c", "node apps/www/server.js"]

# Web / field Next.js images (012 core). Build from monorepo root:
#   docker build -f apps/web/Dockerfile --build-arg APP=web --build-arg PORT=3001 -t weld-web .
#   docker build -f apps/web/Dockerfile --build-arg APP=field --build-arg PORT=3002 -t weld-field .
# Marketing site (serviceweld.com) uses apps/www/Dockerfile separately.
FROM node:24.18-alpine AS deps
ARG APP=web
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/${APP}/package.json apps/${APP}/
COPY packages/api-client/package.json packages/api-client/
COPY packages/domain/package.json packages/domain/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG APP=web
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
COPY packages packages
COPY apps/${APP} apps/${APP}
RUN pnpm --filter @weld/schemas build \
 && pnpm --filter @weld/domain build \
 && pnpm --filter @weld/api-client build \
 && pnpm --filter @weld/${APP} build

FROM node:24.18-alpine AS runner
ARG APP=web
ARG PORT=3001
WORKDIR /app
ENV NODE_ENV=production
ENV APP=${APP}
ENV PORT=${PORT}
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/${APP}/public ./apps/${APP}/public
COPY --from=build /app/apps/${APP}/.next/standalone ./
COPY --from=build /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
EXPOSE ${PORT}
CMD ["sh", "-c", "node apps/${APP}/server.js"]

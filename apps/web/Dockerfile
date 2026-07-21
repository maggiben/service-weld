# Web / field Next.js images (012 core). Build from monorepo root:
#   docker build -f apps/web/Dockerfile --build-arg APP=web --build-arg PORT=3001 -t weld-web .
#   docker build -f apps/web/Dockerfile --build-arg APP=field --build-arg PORT=3002 -t weld-field .
FROM node:24.18-alpine AS deps
ARG APP=web
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/${APP}/package.json apps/${APP}/
COPY packages/api-client/package.json packages/api-client/
COPY packages/domain/package.json packages/domain/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG APP=web
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
ENV PORT=${PORT}
RUN corepack enable
COPY --from=build /app/apps/${APP}/.next ./.next
COPY --from=build /app/apps/${APP}/package.json ./
COPY --from=build /app/apps/${APP}/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE ${PORT}
CMD ["sh", "-c", "pnpm exec next start -p $PORT"]

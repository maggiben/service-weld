# API image (012 core). Build from monorepo root:
#   docker build -f apps/api/Dockerfile -t weld-api .
FROM node:20.16-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
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

FROM node:20.16-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
EXPOSE 3000
CMD ["node", "dist/apps/api/src/main.js"]

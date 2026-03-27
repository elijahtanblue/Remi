FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
RUN pnpm add -g turbo
COPY . .
RUN turbo prune @remi/worker --docker

FROM base AS installer
WORKDIR /app
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=builder /app/out/full/ .
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
RUN pnpm --filter @remi/db db:generate
RUN pnpm --filter @remi/worker... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 remi
COPY --from=installer --chown=remi:nodejs /app .
USER remi
CMD ["node", "apps/worker/dist/bootstrap.js"]

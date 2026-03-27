FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
RUN pnpm add -g turbo
COPY . .
RUN turbo prune @remi/admin --docker

FROM base AS installer
WORKDIR /app
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=builder /app/out/full/ .
RUN pnpm --filter @remi/db db:generate
RUN pnpm --filter @remi/admin build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 remi
# Standalone output: server.js lands at apps/admin/server.js within the image
COPY --from=installer --chown=remi:nodejs /app/apps/admin/.next/standalone ./
# Static assets: relative to server.js location (apps/admin/), so must go here
COPY --from=installer --chown=remi:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
# Note: apps/admin/public does not exist in this repo — do not add a COPY for it
USER remi
EXPOSE 3001
ENV PORT=3001
# Change into the directory where server.js lives before starting
WORKDIR /app/apps/admin
CMD ["node", "server.js"]

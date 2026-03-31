FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 remi
COPY --from=builder --chown=remi:nodejs /app/.next/standalone ./
COPY --from=builder --chown=remi:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=remi:nodejs /app/public ./public
USER remi
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]

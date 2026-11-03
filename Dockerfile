# Spike (FLU-10): production image for memory measurements.
# Build: docker build --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=... --build-arg NEXT_PUBLIC_SERVER_URL=... -t lc-flu-10-app .
FROM node:24.22.2-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.16.1

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    PAYLOAD_SECRET=build-only-placeholder \
    DATABASE_URL=file:/tmp/build.db \
    STRIPE_SECRET_KEY=build-placeholder \
    STRIPE_WEBHOOKS_SIGNING_SECRET=build-placeholder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Static pages query Payload at build time, so the build needs a migrated (empty) database.
RUN pnpm payload migrate && pnpm build

FROM node:24.22.2-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN mkdir -p /data /app/public/media && chown -R node:node /data /app/public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Spike variant: same image with jemalloc (sharp's recommendation for glibc). Build with --target runner-jemalloc.
FROM runner AS runner-jemalloc
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libjemalloc2 && rm -rf /var/lib/apt/lists/*
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
USER node

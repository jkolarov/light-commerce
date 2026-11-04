# syntax=docker/dockerfile:1
# Production image: Next.js standalone output on Node 24 (slim, glibc), run as the non-root `node` user.
# Targets: `runner` (the last stage, the default) and `schema` (one-off schema push, see README "Docker").

ARG NODE_VERSION=24.22.2

# ---- deps: full install, cached on the lockfile ----
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# ---- builder: payload build -> .next/standalone ----
FROM deps AS builder
# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they are build args.
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3000
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
# Build-only placeholders (set on this command, not stored in the image): the build makes no
# Payload queries. The real values come from the runtime environment.
RUN PAYLOAD_SECRET=build-time-placeholder DATABASE_URI=file:/tmp/build.db \
    STRIPE_SECRET_KEY=build-placeholder STRIPE_WEBHOOKS_SIGNING_SECRET=build-placeholder \
    pnpm build

# ---- schema: one-off schema push for a fresh database (until S26's baseline migration) ----
# Has the full node_modules and the Payload CLI. NODE_ENV stays unset on purpose: Payload only
# pushes the schema outside production. Run it with the data volume mounted:
#   docker compose run --rm schema
FROM builder AS schema
RUN mkdir -p /app/data/media && chown -R node:node /app/data /app/src
USER node
ENV DATABASE_URI=file:/app/data/light.db MEDIA_DIR=/app/data/media
CMD ["./node_modules/.bin/payload", "run", "scripts/docker/push-schema.ts"]

# ---- runner: only what the standalone server needs ----
FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URI=file:/app/data/light.db \
    MEDIA_DIR=/app/data/media
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Database and uploads live on one volume. Created here so a new named volume inherits node's ownership.
RUN mkdir -p /app/data/media && chown -R node:node /app/data
VOLUME /app/data
USER node
EXPOSE 3000
# Node's own fetch: the slim image has no curl. /healthz never touches the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Pending migrations run when Payload initialises (prodMigrations), then the server answers.
CMD ["node", "server.js"]

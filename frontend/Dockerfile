# The frontend is its own service with its own build context. It cannot share
# the repository root's Dockerfile: that one is the FastAPI backend, and
# pointing a frontend service at it is what produced
#   failed to calculate checksum of ref ...: "/alembic": not found
# — the backend's COPY steps looking for Python files in a Next.js directory.
#
# Build context is THIS directory, not the repository root:
#   docker build -t bakhoora-web frontend
# On Railway that means the service's root directory must be `frontend`.

# ---------------------------------------------------------------- deps
FROM node:24-alpine AS deps
WORKDIR /app

# Dependencies in their own layer, from the lockfile: application code changes
# on every push, the lockfile rarely does, so this layer survives most builds.
# `npm ci` (not `install`) so the image gets the exact tested versions and
# fails loudly if the lockfile and package.json have drifted apart.
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------- build
FROM node:24-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* is inlined into the client bundle at build time, not read from
# the environment at boot. Setting it only as a runtime variable leaves the
# admin panel showing "the panel has no API to talk to" against a correctly
# configured service, so it has to arrive here as a build argument.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# -------------------------------------------------------------- runtime
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Next writes nothing outside .next/cache at runtime, so the server has no
# reason to be root.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# `standalone` carries the traced server and its dependencies but deliberately
# excludes the static assets and public files — those are served from disk and
# have to be copied in alongside it.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Railway injects PORT; 3000 is only the local default. HOSTNAME must be
# 0.0.0.0 — the standalone server defaults to localhost, which the platform's
# proxy cannot reach from outside the container.
ENV PORT=3000 \
    HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]

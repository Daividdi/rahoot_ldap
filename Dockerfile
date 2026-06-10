FROM node:22-alpine AS base

# pnpm: vendored tarball (offline build) or Corepack (online).
# The [n] glob makes the COPY optional — it won't fail if the folder is absent.
COPY offline/bi[n] /tmp/offline-bin/
RUN if ls /tmp/offline-bin/pnpm-*.tgz >/dev/null 2>&1; then \
      npm install -g /tmp/offline-bin/pnpm-*.tgz && rm -rf /tmp/offline-bin; \
    else \
      corepack enable && corepack prepare pnpm@9.15.9 --activate; \
    fi

# ----- BUILDER -----
FROM base AS builder
WORKDIR /app

# Manifests first, so the install layer stays cached across source-only changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/web/package.json ./packages/web/
COPY packages/socket/package.json ./packages/socket/
COPY packages/common/package.json ./packages/common/

# Vendored offline store (optional — extracted by offline/prepare.sh)
COPY .pnpm-stor[e] ./.pnpm-store/

# Install all dependencies (offline when the store is present)
RUN if [ -d ./.pnpm-store/v3 ]; then \
      pnpm install --offline --store-dir ./.pnpm-store --no-frozen-lockfile; \
    else \
      pnpm install --no-frozen-lockfile; \
    fi

# Copy the rest of the monorepo (node_modules survives — it is dockerignored)
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js app with standalone output for smaller runtime image
WORKDIR /app/packages/web
RUN pnpm build

# Build socket server if needed (TypeScript or similar)
WORKDIR /app/packages/socket
RUN if [ -f "tsconfig.json" ]; then pnpm build; fi

# ----- RUNNER -----
FROM node:22-alpine AS runner
WORKDIR /app

# Create a non-root user for better security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy configuration files
COPY pnpm-workspace.yaml package.json ./

# Copy the Next.js standalone build
COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=builder /app/packages/web/public ./packages/web/public

# Copy the socket server build
COPY --from=builder /app/packages/socket/dist ./packages/socket/dist

# Copy the game default config
COPY --from=builder /app/config ./config

# Expose the web and socket ports
EXPOSE 3000 5505

# Environment variables
ENV NODE_ENV=production
ENV CONFIG_PATH=/app/config

# Start both services (Next.js web app + Socket server)
CMD ["sh", "-c", "node packages/web/server.js & node packages/socket/dist/index.cjs"]

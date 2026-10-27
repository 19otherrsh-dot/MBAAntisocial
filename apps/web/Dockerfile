# syntax=docker/dockerfile:1.7
# Web app + API. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t mba-web .
# NEXT_PUBLIC_* values are baked into the browser bundle, so they are build args.

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
COPY packages/shared/package.json packages/shared/
COPY packages/game-sdk/package.json packages/game-sdk/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_REALTIME_URL=""
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=1 \
    # Placeholders so env validation passes while pages are compiled; the real
    # values are supplied at run time and never baked into the image.
    MONGODB_URI=mongodb://build-placeholder:27017/build \
    AUTH_SECRET=build-time-placeholder-not-a-secret
RUN npm run build -w @mba/web

# Seeding and publishing games need the full toolchain:
#   docker compose run --rm tools npm run seed -w @mba/web
FROM build AS tools
ENV BUILD_STANDALONE=0 MONGODB_URI= AUTH_SECRET=
CMD ["npm", "run", "seed", "-w", "@mba/web"]

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
# The standalone bundle mirrors the monorepo layout under the tracing root.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

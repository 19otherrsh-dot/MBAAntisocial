# syntax=docker/dockerfile:1.7
# Realtime service: sockets, Godot signaling/relay, dedicated servers, scheduler.
#   docker build -f apps/realtime/Dockerfile -t mba-realtime .
# Pass --build-arg GODOT_VERSION=4.4.1 to bundle a headless Godot for
# dedicated-server games; without it those games fall back to other transports.

FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
COPY packages/shared/package.json packages/shared/
COPY packages/game-sdk/package.json packages/game-sdk/
RUN npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/realtime apps/realtime
RUN npm run build -w @mba/realtime

FROM node:22-bookworm-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production PORT=4000 GAME_SERVERS_DIR=/data/game-servers
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
COPY packages/shared/package.json packages/shared/
COPY packages/game-sdk/package.json packages/game-sdk/
# Only the realtime service's runtime dependencies (the shared package is bundled in).
RUN npm ci --omit=dev --no-audit --no-fund -w @mba/realtime
COPY --from=build /repo/apps/realtime/dist apps/realtime/dist

ARG GODOT_VERSION=""
RUN if [ -n "$GODOT_VERSION" ]; then \
      apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && \
      curl -fsSL -o /tmp/godot.zip "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip" && \
      unzip /tmp/godot.zip -d /opt/godot && mv /opt/godot/Godot_v*_linux.x86_64 /usr/local/bin/godot && chmod +x /usr/local/bin/godot && \
      rm -rf /tmp/godot.zip /var/lib/apt/lists/*; \
    fi
ENV GODOT_BIN=${GODOT_VERSION:+/usr/local/bin/godot}

RUN mkdir -p /data/game-servers && chown node:node /data/game-servers
USER node
WORKDIR /repo/apps/realtime
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

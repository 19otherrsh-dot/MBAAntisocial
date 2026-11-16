# Production image: a standalone Next.js server, no dev dependencies,
# running as a non-root user. Build with:
#   docker build -t mbaantisocial .
# Run with the environment from .env.example (at least MONGODB_URI, AUTH_SECRET,
# APP_URL):
#   docker run -p 3000:3000 --env-file .env.production mbaantisocial

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The environment is validated at import time, including during the build.
# These placeholders satisfy the build only; real values are supplied at runtime.
# Pass the public origin so security headers match it, e.g.
#   docker build --build-arg APP_URL=https://app.example.com .
ARG APP_URL=http://localhost:3000
RUN APP_URL=$APP_URL MONGODB_URI=mongodb://build-placeholder:27017/x \
    AUTH_SECRET=build-placeholder-build-placeholder-0000 \
    npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]

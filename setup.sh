#!/usr/bin/env bash
# One-shot setup for macOS and Linux. Safe to re-run: every step checks first.
#   ./setup.sh            install
#   ./setup.sh --seed     + demo campus
#   ./setup.sh --verify   + typecheck, lint, tests, build
# Prefer containers for everything? `docker compose up -d --build` (see README).
set -euo pipefail
cd "$(dirname "$0")"

SEED=0; VERIFY=0
for arg in "$@"; do
  case "$arg" in --seed) SEED=1 ;; --verify) VERIFY=1 ;; *) echo "unknown option: $arg"; exit 2 ;; esac
done

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32mok\033[0m   %s\n' "$1"; }
warn() { printf '    \033[33mwarn\033[0m %s\n' "$1"; WARNINGS+=("$1"); }
fail() { printf '    \033[31mFAIL\033[0m %s\n' "$1"; exit 1; }
WARNINGS=()
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
secret() { node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"; }
envval() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

step 'Checking tools'
command -v node >/dev/null || fail 'Node.js not found. Install Node 20.9+ (https://nodejs.org) and re-run.'
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=9)?0:1)' || fail "Node $(node -v) is too old; 20.9+ is required."
ok "Node $(node -v)"
HAVE_DOCKER=0; command -v docker >/dev/null && docker info >/dev/null 2>&1 && HAVE_DOCKER=1 && ok 'Docker running'

step 'Checking environment files'
WEB_ENV=apps/web/.env.local; RT_ENV=apps/realtime/.env
if [ ! -f "$WEB_ENV" ]; then
  A=$(secret); R=$(secret); I=$(secret); C=$(secret)
  sed -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$A|" -e "s|^REALTIME_SECRET=.*|REALTIME_SECRET=$R|" -e "s|^INTERNAL_API_SECRET=.*|INTERNAL_API_SECRET=$I|" -e "s|^CRON_SECRET=.*|CRON_SECRET=$C|" \
      -e "s|^MONGODB_URI=.*|MONGODB_URI=mongodb://127.0.0.1:27017/mba-antisocial?replicaSet=rs0\&directConnection=true|" apps/web/.env.example > "$WEB_ENV"
  [ -f "$RT_ENV" ] || sed -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$A|" -e "s|^REALTIME_SECRET=.*|REALTIME_SECRET=$R|" -e "s|^INTERNAL_API_SECRET=.*|INTERNAL_API_SECRET=$I|" -e "s|^CRON_SECRET=.*|CRON_SECRET=$C|" apps/realtime/.env.example > "$RT_ENV"
  warn "$WEB_ENV was missing; created it with fresh secrets (and $RT_ENV with the same ones)."
else
  ok "$WEB_ENV present"
  [ -f "$RT_ENV" ] || warn "$RT_ENV missing: copy apps/realtime/.env.example and reuse the web app's secrets."
fi
AUTH_VALUE=$(envval AUTH_SECRET "$WEB_ENV")
[ ${#AUTH_VALUE} -ge 32 ] || fail "AUTH_SECRET in $WEB_ENV must be 32+ characters (generate one with: npx auth secret)."
[ -n "$(envval ANTHROPIC_API_KEY "$WEB_ENV")" ] && ok 'AI features (Claude) configured' || warn 'AI features off until ANTHROPIC_API_KEY is set.'

start_container() { # name port args...
  local name=$1 port=$2; shift 2
  if port_open "$port"; then ok "$name: port $port already in use, assuming it is ours"; return; fi
  [ $HAVE_DOCKER = 1 ] || fail "Nothing on port $port and Docker is not running. Start Docker or install the service natively."
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then docker start "$name" >/dev/null; else docker run -d --name "$name" --restart unless-stopped "$@" >/dev/null; fi
  for _ in $(seq 1 30); do port_open "$port" && { ok "$name running on $port"; return; }; sleep 1; done
  fail "$name did not start; check: docker logs $name"
}

step 'Checking MongoDB'
if envval MONGODB_URI "$WEB_ENV" | grep -qE '127\.0\.0\.1|localhost'; then
  start_container mba-mongo 27017 -p 27017:27017 -v mba-mongo-data:/data/db mongo:7 --replSet rs0 --bind_ip_all
  if [ $HAVE_DOCKER = 1 ] && docker ps --format '{{.Names}}' | grep -qx mba-mongo; then
    for _ in $(seq 1 15); do
      docker exec mba-mongo mongosh --quiet --eval "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]}).ok }" 2>/dev/null | grep -q 1 && break; sleep 1
    done
    ok 'Replica set rs0 ready'
  fi
else ok 'Remote MongoDB'; fi

step 'Checking Redis'
if envval REDIS_URL "$WEB_ENV" | grep -qE '127\.0\.0\.1|localhost'; then start_container mba-redis 6379 -p 6379:6379 redis:7-alpine
elif [ -n "$(envval REDIS_URL "$WEB_ENV")" ]; then ok 'Remote Redis'
else warn 'REDIS_URL empty: the app runs without live updates or multiplayer.'; fi

step 'Installing dependencies'
npm ci
ok 'node_modules installed'

if [ $SEED = 1 ]; then step 'Seeding the demo campus'; npm run seed; ok 'Sign in as sneha@iima.ac.in or admin@iima.ac.in, password seedpassword123'; fi
if [ $VERIFY = 1 ]; then step 'Verifying'; npm run verify; ok 'Verify passed'; fi

printf '\n'
if [ ${#WARNINGS[@]} -gt 0 ]; then echo 'Setup complete, with notes:'; for w in "${WARNINGS[@]}"; do echo "  - $w"; done; else echo 'Setup complete.'; fi
printf '\nStart it in two terminals:\n  npm run dev            ->  http://localhost:3000\n  npm run dev:realtime   ->  live updates, chat, multiplayer (port 4000)\n'

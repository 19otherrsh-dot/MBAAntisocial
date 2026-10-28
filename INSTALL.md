# Installing MBAAntisocial

This guide takes a new computer to a running copy, and then a running copy to
production. Each optional feature has a short section on getting its keys.

---

## 1. Install the tools

| Tool | Why | Get it |
| --- | --- | --- |
| **Node.js 20.9+** (22 recommended) | Runs everything | https://nodejs.org (LTS) |
| **Git** | Gets the code, keeps it in sync | https://git-scm.com |
| **Docker Desktop** | Runs MongoDB and Redis without installing them | https://www.docker.com/products/docker-desktop |

Check them in a new terminal:

```bash
node --version    # v20.9 or newer
git --version
docker info       # should print server details, not an error
```

Don't want Docker? Install MongoDB 7 and Redis 7 natively, or use MongoDB Atlas
and Upstash. Then set `MONGODB_URI` and `REDIS_URL` yourself.

## 2. Get the code

```bash
git clone https://github.com/19otherrsh-dot/mbaantisocial.git
cd mbaantisocial
```

## 3. Run the setup script

```bash
./setup.sh --seed                                              # macOS / Linux
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Seed     # Windows
```

It checks each step before acting, so it's safe to re-run. It does the following:

1. Checks Node and Docker.
2. Creates `apps/web/.env.local` and `apps/realtime/.env` from their templates, with fresh secrets shared by both.
3. Starts MongoDB as a one-node replica set (`mba-mongo`) and Redis (`mba-redis`) in Docker, when they point at this machine.
4. Runs `npm ci`.
5. With `--seed`, loads a demo campus (IIM Ahmedabad) whose accounts all use the password `seedpassword123`.

Add `--verify` (`-Verify` on Windows) to also run the type checks, lint, tests and
a production build.

## 4. Start it

Use two terminals:

```bash
npm run dev            # http://localhost:3000
npm run dev:realtime   # port 4000: live chat, notifications, multiplayer games
```

Sign in as `sneha@iima.ac.in` with `seedpassword123`. The app works without the
realtime service; you just won't get live updates or online multiplayer.

### Or run everything in containers

```bash
cp apps/web/.env.example apps/web/.env
cp apps/realtime/.env.example apps/realtime/.env
# Put the same AUTH_SECRET, REALTIME_SECRET and INTERNAL_API_SECRET in both
# (each 32+ random characters: `openssl rand -hex 32`).
docker compose up -d --build
docker compose run --rm tools       # seeds the demo campus
```

Email sent by the app lands in Mailpit at http://localhost:8025.

---

## 5. Turn on the optional features

Each feature switches on when its keys are in `apps/web/.env.local`. Restart
`npm run dev` after editing. `src/lib/env.ts` explains any bad value at startup.

| Feature | Keys | Where to get them |
| --- | --- | --- |
| **AI**: interviewer, GD simulator, resume roast and bullet rewrites, timetable import, quiz, jargon | `ANTHROPIC_API_KEY` | https://console.anthropic.com → API keys. `ANTHROPIC_MODEL` overrides the default model. |
| **Email**: verification, reminders, digest | `RESEND_API_KEY` *or* `SMTP_URL`, and `EMAIL_FROM` | https://resend.com (verify your domain), or any SMTP provider. Without either, emails print to the server log. |
| **File uploads in the cloud** | `CLOUDINARY_*` | https://cloudinary.com. Without it, files go to `UPLOAD_DIR` on disk. |
| **Google Meet links for mocks** | `GOOGLE_CALENDAR_CLIENT_ID/SECRET` | Google Cloud Console → enable the Calendar API → OAuth client (web). Redirect URI: `<APP_URL>/api/integrations/google_calendar/callback`. Mentors connect their calendar in Settings. |
| **Zoom links** | `ZOOM_CLIENT_ID/SECRET` | Zoom App Marketplace → General app (OAuth). Redirect URI: `<APP_URL>/api/integrations/zoom/callback`. |
| **Built-in video and hub voice** | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit Cloud, or `docker compose --profile voice up -d livekit` (dev keys `devkey` / `secret`, URL `ws://localhost:7880`). |
| **Sign in with Google** | `AUTH_GOOGLE_ID/SECRET` | Google Cloud Console → OAuth client. Redirect URI: `<APP_URL>/api/auth/callback/google`. |
| **Sign in with Microsoft** | `AUTH_MICROSOFT_ENTRA_ID_*` | Azure portal → App registrations. Redirect URI: `<APP_URL>/api/auth/callback/microsoft-entra-id`. |
| **Sign in with LinkedIn** | `AUTH_LINKEDIN_ID/SECRET` | LinkedIn Developers → app with "Sign In with LinkedIn using OpenID Connect". Redirect URI: `<APP_URL>/api/auth/callback/linkedin`. |
| **Browser push** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| **Discord bridge** | `DISCORD_CLIENT_ID/SECRET`, `DISCORD_BOT_TOKEN` (web *and* realtime) | Discord Developer Portal → application → Bot (enable the Message Content intent). Campus admins paste their server id in Campus admin. |
| **Peer-to-peer games behind strict networks** | `GAME_ICE_SERVERS` | A TURN service (e.g. Cloudflare Calls, Twilio, or your own coturn), as a JSON list. |
| **Dedicated game servers** | `GODOT_BIN` and `GAME_SERVERS_DIR` (realtime) | A Godot 4 binary. The Docker image bundles one with `--build-arg GODOT_VERSION=4.4.1`. |
| **Daily briefing feeds** | `NEWS_FEEDS` | Comma-separated RSS/Atom URLs. Empty uses the built-in list. |

Sign-in is restricted to institute domains in the campus registry. Platform
admins approve new campuses at `/admin`. Put your own email in
`PLATFORM_ADMIN_EMAILS` to be promoted on first sign-in.

---

## 6. Put it in production

### A. One server with Docker

This suits a VPS or a campus server.

1. Install Docker, then clone the repo.
2. Create both `.env` files as in step 4, with:
   - `APP_URL=https://your-domain`;
   - `NEXT_PUBLIC_REALTIME_URL=https://rt.your-domain`, passed at build time through `PUBLIC_REALTIME_URL` for compose;
   - real email settings.
3. Run `docker compose up -d --build`.
4. Put a TLS reverse proxy in front: Caddy, nginx or Traefik.
   - Send `your-domain` to `:3000` and `rt.your-domain` to `:4000`.
   - Allow WebSocket upgrades for the realtime host.
5. Back up the `mongo-data` and `uploads` volumes.

The realtime container runs the scheduled jobs (`SCHEDULER_ENABLED=true` in compose).

### B. Vercel and managed services

1. **MongoDB Atlas.** Create a cluster and copy its `mongodb+srv://` URI. Allow Vercel's egress, or `0.0.0.0/0` with a strong password.
2. **Upstash** (or Redis Cloud). Copy the `rediss://` URL.
3. **Vercel.** Import the repo, set the root directory to `apps/web`, and add the env vars from `apps/web/.env.example`. `vercel.json` registers the cron jobs.
   - The every-5-minutes reminder cron needs a Pro plan.
   - On Hobby, change it to daily, or let the realtime service's scheduler run the jobs instead.
4. **The realtime service.** Deploy `apps/realtime/Dockerfile` to Fly.io, Render or Railway, using a service that keeps a process running.
   - Set its env vars from `apps/realtime/.env.example`, with `WEB_INTERNAL_URL` pointing at the Vercel URL.
   - Set `SCHEDULER_ENABLED=false` there, because Vercel runs the crons.
   - Then set `NEXT_PUBLIC_REALTIME_URL` in Vercel to its public URL and redeploy.
5. **Uploads.** Vercel's disk isn't persistent, so configure Cloudinary.

### Publishing your Godot games

Export each game for the Web from Godot 4 with the SDK addon enabled (see
[packages/game-sdk/README.md](packages/game-sdk/README.md)). Then either:

- commit it with the app: `npm run publish-game -w @mba/web -- --id ludo --dir path/to/export --version 1.0.0`; or
- upload the export to a CDN folder and publish it from **Admin → Games**. It goes live within a minute and can be rolled back.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Invalid environment configuration` on start | The message names the bad key; fix it in `apps/web/.env.local`. |
| "running scripts is disabled on this system" (Windows) | Use the full `powershell -ExecutionPolicy Bypass -File .\setup.ps1` command; the bypass applies to that run only. |
| "Docker is installed but not running" | Start Docker Desktop, wait for *Engine running*, re-run the script. |
| Port 27017 or 6379 already in use | Another MongoDB or Redis is running. Use it (keep the URL) or stop it. Mongo must be a replica set for the local URI in the template, or drop `replicaSet=rs0` from `MONGODB_URI`. |
| Chat and notifications don't update live | Start `npm run dev:realtime`, and check that `REALTIME_SECRET` and `INTERNAL_API_SECRET` match in both env files and that `NEXT_PUBLIC_REALTIME_URL` points at it. |
| A multiplayer game never connects | The realtime service must be running. Peer-to-peer games on restrictive networks need `GAME_ICE_SERVERS` with a TURN server. |
| AI buttons say AI is not configured | Set `ANTHROPIC_API_KEY` and restart. |
| Sign-in says the domain isn't allowed | Add the campus at `/admin` (or approve the request it created), or list the domain in `ALLOWED_EMAIL_DOMAINS`. |
| Signed out after changing `AUTH_SECRET` | Expected; sign in again. |
| `npm ci` fails | Check `node --version` is 20.9+; delete `node_modules` and re-run. |
| The production build fails with a type error inside `.next/dev/types` | A dev server was stopped mid-write: delete `apps/web/.next/dev` and build again. |

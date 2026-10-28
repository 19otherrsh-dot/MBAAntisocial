# MBAAntisocial

The day-to-day operating layer for a B-school student. It replaces the nine
WhatsApp groups, the spreadsheet and the Drive folder nobody can search:

- book mock interviews with actual seniors;
- track every deadline, class and grade;
- find the notes your own batch wrote;
- run your clubs;
- play a game of Ludo between classes.

It's built for official institute accounts only. It comes in two editions,
following [the product spec](docs/PRD.md) (§15):

- **Open Edition** works for one person on day one: the daily business briefing
  and quiz, the jargon buster, opportunities, AI interview practice, the resume
  studio, academics, money, wellbeing, games, and mock sessions with mentors
  from other campuses.
- **Campus Edition** unlocks per school once enough of a batch and its seniors
  are here: mocks with your own seniors, interview intel, the notes library,
  the campus feed and Discord-style hub, events, clubs, marketplace, the company
  wiki, alumni referrals and more.

The app engages without dark patterns (§16): leaderboards are opt-in, there is no
guilt-based streak copy and no infinite feed. Today ends with "That's today."

---

## What's in it

| Section | Highlights |
| --- | --- |
| **Today** | Classes with one-tap attendance, what's due, sessions and placement rounds, the briefing and quiz, a private check-in. One request, one honest summary. |
| **Prep** | Mock sessions with real Google Meet / Zoom / LiveKit / Jitsi links, two-way rubric feedback, group GDs that auto-match, AI interviewer and GD simulator (Claude), interview intel, applications pipeline, resume studio (one-page builder with print-exact PDF and AI roast), company wiki, offers, alumni referrals. |
| **Academics** | Tasks and habits, timetable (AI import from a photo), attendance ("how many can I skip"), grades and CGPA, notes and past papers behind an honour code, course reviews, competitions, team workspaces. |
| **Campus** | Chronological feed, the Hub (servers, channels, threads, DMs, voice, and a two-way Discord bridge), events with RSVP and calendar sync, clubs (recruitment, budgets, tasks), marketplace, splits, mess menu, lost and found. |
| **Play** | Godot games embedded in a cross-origin-isolated player: online (WebRTC, relay or dedicated server), vs bot, pass-and-play, rated tournaments. |
| **Discover** | Daily briefing, daily quiz, jargon buster, placement insights. |
| **Me** | Profile, money (loan EMI, budget), wellbeing (non-clinical, with real helplines and the campus counsellor), settings. |
| **Native app** | iOS and Android (Expo): Today, Prep, Tasks, Hub chat, push; everything else opens signed in inside the app. See [apps/mobile/README.md](apps/mobile/README.md). |
| **Institute** | Campus report for the placement office, moderation, campus admin, and the platform admin console with the PRD's success metrics and an audit log. |

A calendar feed (ICS) puts classes, sessions, tasks and events in any calendar app.
Notifications reach people in-app, live, by email and by push, and respect
quiet hours.

---

## Run it

You need Node 20.9 or newer, plus Docker (or local MongoDB 7 and Redis 7).
Step-by-step help for a new machine is in **[INSTALL.md](INSTALL.md)**.

### Option 1: the setup script

```bash
./setup.sh --seed                                            # macOS / Linux
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Seed   # Windows
```

The script:

- creates `apps/web/.env.local` and `apps/realtime/.env` with fresh shared secrets;
- starts MongoDB (as a replica set) and Redis in Docker;
- installs dependencies;
- seeds a demo campus.

Then, in two terminals:

```bash
npm run dev            # web app      → http://localhost:3000
npm run dev:realtime   # live updates, chat, multiplayer → :4000
```

### Option 2: everything in Docker

```bash
cp apps/web/.env.example apps/web/.env              # set AUTH_SECRET, REALTIME_SECRET, INTERNAL_API_SECRET
cp apps/realtime/.env.example apps/realtime/.env    # the same three secrets
docker compose up -d --build
docker compose run --rm tools                       # optional: seed the demo campus
```

That gives:

- the web app on :3000 and the realtime service on :4000;
- MongoDB, Redis, and Mailpit (captured email, on :8025).

Add `--profile voice` for a local LiveKit server. Set `GODOT_VERSION` to bundle a
headless Godot for dedicated-server games.

### Option 3: Vercel and managed services

Each part runs on a managed service:

- **Web app:** Vercel. The project root is `apps/web`, and `vercel.json` schedules the cron jobs.
- **Database and Redis:** MongoDB Atlas, and Upstash or Redis Cloud.
- **Realtime service:** any Node host that keeps a process running, such as Fly.io, Render or Railway. Build it with `apps/realtime/Dockerfile`, and set `SCHEDULER_ENABLED=false` there because Vercel runs the crons.

### Demo accounts

After seeding, every account's password is `seedpassword123`.

| Account | Sees |
| --- | --- |
| `sneha@iima.ac.in` | A busy first-year: classes, tasks, a booked mock, the briefing |
| `priya@iima.ac.in` | A senior who mentors, including students from other campuses |
| `ananya@iima.ac.in` | A senior moderator: the moderation queue |
| `placements@iima.ac.in` | Placement office: the campus report |
| `admin@iima.ac.in` | Platform admin: `/admin` |
| `vikram@alumni.iima.ac.in` | An alum with a referral request waiting |
| `kabir@iimb.ac.in` | A first-year on the Open Edition (IIM Bangalore hasn't unlocked yet) |

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run dev:realtime` | Development servers |
| `npm run seed` | Wipe and seed the demo campus |
| `npm run typecheck` · `lint` · `test` | Across every workspace |
| `npm run build` | Production builds |
| `npm run verify` | All of the above |
| `npm run e2e -w @mba/web` | Browser smoke test against a seeded instance (`BASE=` to point it elsewhere) |
| `npm run publish-game -w @mba/web -- --id ludo --dir <web export> --version 1.0.0` | Publish a Godot build ([guide](packages/game-sdk/README.md)) |

CI runs the first five, then the smoke test against a seeded production build
(`.github/workflows/ci.yml`). A separate job parses the Godot addon in a headless
Godot (`godot.yml`).

---

## Layout

```
apps/web          Next.js 16 app: UI, REST API, cron endpoints
apps/realtime     Socket.IO fan-out, Godot signaling / relay / dedicated servers, scheduler, Discord gateway
apps/mobile       Expo app for iOS and Android (own lockfile, outside the workspaces; see its README)
packages/shared   Domain vocabulary and pure, tested rules shared by every app
packages/game-sdk Godot 4 addon + plain-JS SDK + a reference game
docs/PRD.md       The product requirements document
HANDOFF.md        The full engineering handoff: architecture, conventions, status, what's next
```

Every external service sits behind a port with interchangeable adapters, chosen
from the environment in `apps/web/src/server/container.ts`:

| Service | Adapters |
| --- | --- |
| AI | Claude |
| Email | Resend, SMTP or the console |
| Storage | Cloudinary or local disk |
| Meetings | Google Meet, Zoom, LiveKit, Jitsi or a manual link |
| Realtime | Redis |
| Push | Web Push and Expo |

Everything optional switches itself off cleanly when its keys are missing. For
the architecture, the conventions this codebase depends on, and the roadmap, read
**[HANDOFF.md](HANDOFF.md)**.

# MBAAntisocial

The day-to-day operating layer for a B-school student: book mock interviews with
actual seniors, track every deadline in one place, and find the notes your own
batch wrote — instead of nine WhatsApp groups, a spreadsheet, and a Drive folder
nobody can search.

This repository implements the **Campus Edition** (PRD §15, Version B): the
campus-scoped product where the density actually lives.

---

## Running it

Requires Node 20.9+ and a MongoDB instance. Setting up a new machine from
scratch: see [INSTALL.md](INSTALL.md).

```bash
npm install
cp .env.example .env.local     # then fill in MONGODB_URI and AUTH_SECRET
npm run seed                   # optional, but the app is hard to judge empty
npm run dev
```

A local MongoDB via Docker:

```bash
docker run -d -p 27017:27017 --name mba-mongo mongo:7
```

On Windows, `setup.ps1` does all of the above and checks each step: tooling,
`.env.local` (created with a fresh secret if missing), MongoDB (starts a Docker
container when the URI is local), and `npm ci`. Add `-Seed` and/or `-Verify`:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Seed -Verify
```

Generate a session secret with `npx auth secret`. `src/lib/env.ts` validates the
environment at boot and fails with a readable message rather than surfacing
`undefined` deep inside a request.

### Seed accounts

`npm run seed` builds one campus (IIM Ahmedabad) with four seniors publishing
slots, five juniors, a booked session, a completed session carrying both sides of
the feedback rubric, a resource library, four competitions, a feed with real
threads, tracked pipelines and interview intel, and data for every newer page —
opportunities, whispers, offer benchmarks, splits, a study room, contacts, and a
DM thread. Every account uses the password `seedpassword123`.

| Account | Role |
| --- | --- |
| `admin@iima.ac.in` | Institute admin — the admin console: people, roles, competitions, audit log |
| `placements@iima.ac.in` | Institute staff — sees the campus report, moderates nothing |
| `ananya@iima.ac.in` | Senior, moderator — has the moderation queue |
| `priya@iima.ac.in` | Senior, mentor — has a completed session with feedback |
| `sneha@iima.ac.in` | Junior — has bookings, tasks, a pipeline, and an overdue item |
| `meera@iima.ac.in` | Junior — has a completed session and an open message thread |

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the React Compiler rules |
| `npm run seed` | Rebuild the seeded campus (reads `.env.local`) |
| `npm test` | Unit tests; add `TEST_MONGODB_URI` to run the database tests too |
| `npm run db:migrate` | Apply pending data migrations (`migrations/`); `db:migrate:status` lists them |
| `npm run db:migrate:create -- <name>` | Start a new migration |
| `npm run db:indexes` | Build every declared index (run once per production deploy) |
| `npm run test:e2e` | Playwright, desktop and phone, against a production build (reseeds the database) |
| `npm run load-test` | Signed-in load test of the busiest reads; fails over a p99 budget |
| `npm run verify` | typecheck → lint → test → build |

---

## Architecture

Next.js 16 (App Router, Turbopack) · React 19 · MongoDB via Mongoose 9 ·
Auth.js v5 · zod · CSS Modules.

```
src/
  app/
    (auth)/          Sign in and registration
    (app)/           Everything behind a session, wrapped in the app shell
    legal/           Sharing policy and privacy — readable signed out
    api/             Route handlers
  components/
    ui/              Design-system primitives
    layout/          Shell, sidebar, top bar, notifications
    brand/           Logo mark and wordmark
  lib/
    api/             Route wrapper, typed errors, rate limiting
    client/          Browser data layer and hooks
    *.ts             Domain services: gamification, scheduling, recurrence, notifications
  models/            Mongoose schemas
```

### The route wrapper

Every API route goes through `route()` in `src/lib/api/handler.ts`, which
resolves the session, validates the body and query against a zod schema, applies
rate limiting, connects to the database, loads the caller, gates on role, and
serialises any thrown `ApiError` into a consistent JSON envelope. Handlers below
that line can assume a valid `actor` and parsed input.

**The caller is read from the database on every request, not from the token.**
The session token proves *who* is calling; what they may do — role, campus,
suspension — is looked up fresh by primary key. A token is a thirty-day
snapshot, and authorising from it meant a suspended account kept working and a
revoked moderator stayed a moderator until it expired. A password reset also
retires every session issued before it.

Input is validated **before** the database is touched, so a malformed request
costs a schema parse rather than a connection from the pool.

### Client data layer

`useApiQuery` aborts in-flight requests when the query key changes, so a slow
response for a filter the user has already moved past cannot land and overwrite
the current one. `loading` is derived by comparing the settled result's key
against the current one rather than flipped by a `setState` inside an effect.

Live counters (points, karma, streak) come from `/api/me`, never the session
token — a JWT is only reissued at sign-in, so anything stored on it would be
frozen at whatever it was that day.

---

### Time

Every "which day is it" question — streaks, habit due dates, "due today",
notification copy — is answered in `APP_TIME_ZONE` through `src/lib/time.ts`,
never the host's clock. Hosts run in UTC, where an Indian campus's day rolls
over at half past five in the morning.

### Realtime

Messages and notifications go out over Pusher on **private** channels
(`private-user-<id>`, `private-room-<id>`), each signed by `/api/pusher/auth`
after checking the caller may read it. Realtime is optional: without keys,
everything still arrives on the next load.

### AI

`src/lib/ai.ts` wraps the model calls. Replies stream to the browser as plain
text, and a model failure before the first word becomes a real error status
instead of an empty reply. The interviewer is grounded in the campus's own
Interview Intel for the company being practised, and finishes with a scorecard
on the same rubric seniors use. The resume roast reads the PDF in memory and
keeps nothing.

### The game layer

`src/lib/game/` holds the rules as pure functions — levels, daily quests,
achievements, the season path — and `loadGameState()` assembles them from the
points ledger. Nothing is a second source of truth: a quest's progress *is*
today's ledger rows, an achievement *is* a lifetime count. Claims
(`POST /api/game`) are re-checked on the server and paid through a stable
ledger entity, so a retry, a double-tap, or a second tab pays once.

On the client, the API wrapper announces every change (`api:mutated`); the
`GameProvider` re-reads progress and turns the difference into feedback — a
floating "+XP", a quest toast, or a full-screen celebration. Pages never call
the game directly. Celebrations already seen are recorded on the account, and an
account's existing standing is recorded as seen on its first load, so nobody is
greeted by fireworks for last month.

What stays from the original design: ranking is opt-in (the weekly league
included), streaks forgive a missed day, and streak shields are earned by
showing up — never bought. All motion respects `prefers-reduced-motion`, and
sound effects are synthesised (no files) and switchable from the Path page.


`tests/unit` covers the rules that are easy to get subtly wrong — time zones,
streaks, banding, channel names, name normalisation, Markdown escaping, and the
session-update escalation. `tests/integration` runs against a throwaway MongoDB
(`TEST_MONGODB_URI`): one-payout ledger awards, daily caps, milestone payouts,
mentor capacity, atomic split claims, the campus boundary on messaging,
once-only reminders, admin rules, and the append-only audit log. `e2e/` drives
a real browser through sign-up and onboarding, the game loop, the admin console
and audit trail, permission boundaries, and the phone layout. CI
(`.github/workflows/ci.yml`) runs all of it against a MongoDB service.

## Running an institute

The pieces an institute's IT and placement office need, each behind one seam.

**Single sign-on.** Google and Microsoft Entra ID through Auth.js, alongside
email and password. A provider appears on the sign-in page only when its keys
are set (`src/lib/sso.ts` is the registry; adding Okta or SAML via an OIDC
bridge is one entry). Sign-in is decided by one pure function,
`decideSsoSignIn`: the provider must vouch for the email, and its domain must
be bound to a campus in `CAMPUS_EMAIL_DOMAINS` — so SSO can never place someone
in a campus their address does not prove. A matching account is linked; a new
one is created as a first-year and asked their year in onboarding.

**Admin console** (`/admin`, role `admin`). People — search, filter, change a
role, suspend or restore, with a required reason; Competitions — add, edit,
archive the campus calendar; Audit log — every privileged action, filterable
and exportable as CSV. Rules live in `src/lib/admin/*` (no changing your own
role, never removing the last admin, everything campus-scoped), and the API
routes stay thin.

**Audit log.** `AuditLog` is append-only: the model refuses updates, and
`recordAudit()` never throws, so a logging hiccup cannot fail the action it
records. Role changes, suspensions, report resolutions, hidden content,
password resets, SSO provisioning, competition edits, and account deletions are
recorded with who, what, when, and why.

**Notifications.** `notify()` writes the in-app item, then hands it to every
channel that accepts it (`src/lib/notify/channels.ts`): realtime via Pusher,
and email via Resend for the kinds that matter — bookings, cancellations,
reschedules, reminders, deadlines, moderation. Each person can turn email off
in Profile. A new channel (web push, Slack) implements one interface.

**Calendar invites.** Bookings email an `.ics` invite (RFC 5545, a stable UID
per session) to both sides; a reschedule updates the same event and a cancel
removes it, in Google, Outlook and Apple Calendar alike.

**Reminders.** `src/lib/jobs/reminders.ts` is a list of rules — a session in
24 hours and in 1 hour, a task due soon, a saved competition's deadline, an
interview round tomorrow. Each send is claimed in `ReminderLog` first, so a
reminder goes out once however often the job runs. `/api/cron/reminders` runs
them; `.github/workflows/reminders.yml` calls it hourly (Vercel's free plan
runs crons only daily, which `vercel.json` keeps as a fallback).

**Error tracking.** Every server error is logged as one JSON line
(`src/instrumentation.ts`) and, with `SENTRY_DSN` set, sent to Sentry —
browser errors too with `NEXT_PUBLIC_SENTRY_DSN`. Nothing personal is sent: no
cookies, bodies, query strings, or user details. Application code reports
through `reportError()` only, so the vendor is swappable.

**Migrations.** Data changes ship as `migrate-mongo` scripts in `migrations/`,
recorded in a `changelog` collection so each runs once. Index changes stay
declared on the models and are built by `npm run db:indexes`.

## Deploying

**Vercel (recommended).** Import the repository, set the environment variables
from `.env.example`, and deploy. `vercel.json` schedules the weekly digest and
a daily reminder run. Use MongoDB Atlas for the database. On each deploy that
changes the schema, run against the production database:

```bash
npm run db:migrate && npm run db:indexes
```

For hourly reminders, add `APP_URL` and `CRON_SECRET` as GitHub Actions secrets.

**Anywhere with Docker.**

```bash
cp .env.example .env.production   # set AUTH_SECRET, APP_URL, and the integrations you use
docker compose up -d --build      # the app plus MongoDB with a persistent volume
```

The image is a standalone Next.js server running as a non-root user, with a
health check on `/api/health`. Pass `--build-arg APP_URL=https://…` so the
HTTPS-only headers (HSTS, upgrade-insecure-requests) are emitted.

**Before launch**

- [ ] `AUTH_SECRET` is fresh and long; `APP_URL` is the real `https://` origin
- [ ] `CAMPUS_EMAIL_DOMAINS` binds each campus to its email domain
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` set (turns on email confirmation)
- [ ] `UPSTASH_REDIS_REST_URL` / `_TOKEN` set if more than one instance runs
- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` set and `GEMINI_MODEL` pinned to a stable id
- [ ] Pusher keys set for realtime (optional)
- [ ] `npm run db:migrate && npm run db:indexes` run against the production database
- [ ] An admin account exists (set `role: "admin"` on one user in Atlas; after that, manage roles in `/admin`)
- [ ] SSO keys set if the institute signs in with Google or Microsoft (redirect URIs in `.env.example`)
- [ ] `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` set, and alerts routed to someone
- [ ] `CRON_SECRET` set, plus the `APP_URL` / `CRON_SECRET` GitHub secrets for hourly reminders
- [ ] `/api/health` wired to your uptime monitor
- [ ] `/legal/terms` and `/legal/privacy` reviewed by counsel for your jurisdiction

**What is in place:** a strict Content Security Policy and the usual security
headers, HSTS over HTTPS, an error hook (`src/instrumentation.ts`) that logs one
JSON line per server error for any log drain, a global error screen, robots and
sitemap, password reset and email confirmation, account export and deletion
(Profile → Your data), and CI that runs everything on each push.

## Performance

Measured on a production build with seeded data. Cold loads, signed in where
the page needs it; the phone profile is a Pixel 7 with a 4× slower CPU on slow
4G (150 ms round trips, 1.6 Mbps).

| | Desktop | Phone |
| --- | --- | --- |
| First paint | 0.07–0.12 s | 0.74–0.80 s |
| Largest paint, signed-in pages | 0.24–0.28 s | 2.4–2.5 s |
| Layout shift (CLS) | ≤ 0.02 | ≤ 0.07 |
| Today → Path navigation | 0.14 s | 0.44 s |
| Tick a task → "+XP" on screen | 0.27 s | 0.93 s |
| Celebration animation | 61 fps | 61 fps |

Lighthouse: accessibility and best practices 100 on every page measured;
performance 92–100 except Path on the phone profile (75, a simulated estimate —
the real measurement above is 2.5 s). Signed-in pages score lower on SEO only
because `robots.txt` keeps them out of search on purpose.

**Under load** (`npm run load-test`: 25 concurrent signed-in clients against
one local Node process and MongoDB): 190–290 requests/s on the account, game,
feed, tasks, notifications and standings APIs with p99 at 110–210 ms, 78 pages/s
for the signed-in home page at p99 600 ms, no errors. Throughput scales with
instances; with more than one, set the Upstash keys so rate limits are shared.

Two choices carry most of it: the account and game state are preloaded in the
first flush of the HTML, so they load in parallel with the JavaScript; and
placeholders are sized to the content they stand in for, so nothing jumps.

## Design decisions worth knowing

**The pipeline and the intel bank are one loop, not two features.** A tracked
round writes a real deadline into the task list and surfaces the matching mock
session type; concluding that round opens the debrief prompt, and what the
student writes down lands in the campus question bank. Both halves of what the
product needs — a reason to open it, and a contribution to the shared asset —
fall out of the student doing the thing they were going to do anyway.

This is also the only part of the product that compounds without further work.
A question logged this December still prepares juniors two seasons from now, and
a national marketplace cannot replicate it: its users are spread across every
institute, so its density for any one company at any one campus is effectively
zero. Campus scoping is what makes "what the panel asked *here*" a thing that
can exist.

**Messaging is not a general capability.** The scheduling module exists because
unstructured DMs to seniors *are* the problem it replaces. An open inbox
reintroduces exactly that and bypasses the booking cap, since a DM respects no
cap. So `lib/connections.ts` unlocks a conversation only once something has
happened between two people: they completed a session together, the other person
messaged first, one of them posted an opportunity inviting contact, or a
moderator is involved. Everything else is a cold DM. The gate applies to reading
a thread as well as writing to one — otherwise it only stops people sending, not
looking.

**Campus is proven, not claimed.** Everything is scoped by campus, so a
dropdown is not a boundary. `CAMPUS_EMAIL_DOMAINS` binds a domain to a campus;
once bound, the address decides the campus and must be confirmed before the
account can sign in. No role — alumni included — bypasses the campus scope.

**Cross-campus is the author's choice, per item.** A feed post or study room
reaches other campuses only when the person creating it says so. The
all-campuses view shows those items and nothing else.

**Opportunities are campus-internal, not a job board.** Competing on external
listings means competing with national marketplaces without their employer
relationships, and an empty listings page is the single most damaging screen a
small platform can show. What is here is supply that already exists on a campus
and appears on no placement portal — club recruitment, TA positions, live
projects, student ventures — plus alumni referrals, which are a person from your
own school rather than a listing anyone can scrape.

**The campus report is aggregate-only, with a disclosure floor.** `/campus`
answers the question a placement cell has that no incumbent system can — *is
this batch prepared* — from leading indicators rather than outcomes. Because
individual pipelines are private, any breakdown covering fewer than
`MIN_REPORTABLE_COHORT` students is **withheld entirely** rather than rounded:
on a small campus, "one applicant to Company X, rejected" identifies that person
as surely as a list would. Track demand counts distinct students, not
applications, so one person chasing eight consulting firms cannot inflate a cell
past the floor.

**Staff access is a separate grant from moderation.** `placement_office` reads
the report and moderates nothing; `moderator` hides content and sees no report.
A placement officer has no business hiding a student's post, and a student
moderator should not become institute staff by implication.

**A pipeline is private by construction.** There is no campus-wide read path for
applications and no index that would support one — who applied where, and who
was rejected, is the most sensitive data in the product. Only the question bank
is shared, and only through a deliberate, per-round act of contribution.
Deleting an application leaves contributed questions in place: they were given
to the campus, not attached to one person's record-keeping.

**Anonymity has exactly one narrow exception.** A contributed question can hide
its byline, defaulted on for rounds the contributor did not clear. Requiring a
name on a rejection would simply stop the most useful entries being written. The
contributor id is still stored, so moderation and karma both still work — this
hides a name, it does not create an unaccountable posting channel.

**Points and karma are separate ledgers.** Points measure looking after
yourself; karma measures looking after everyone else. Only karma is worth
ranking, which is what stops a leaderboard rewarding pure self-interest. Both
are append-only rows in `LedgerEntry`, with daily caps and a unique
`(user, action, entity)` index — so an award cannot be farmed by repeating an
action, and a retry or double-click cannot pay out twice.

**Session credit lands on completion, not booking.** Crediting at booking time
makes book → cancel → re-book an unbounded points loop and rewards intent rather
than attendance.

**Feedback direction is derived server-side.** Which rubric applies is decided
by the caller's relationship to the specific slot. The client cannot assert it,
and the session must actually have completed.

**Everything is campus-scoped in the query.** Not filtered in the UI — a student
at one school cannot see or book slots published at another, and a slot id from
another campus reports as "not found" rather than "forbidden" so ids cannot be
probed for existence.

**Demand is capped at the requester.** A junior may hold three live bookings,
and mentors set a weekly capacity on top. Capping demand at the source is what
lets seniors keep availability open (PRD §11); the alternative is seniors
quietly withdrawing.

**Streaks forgive a missed day.** PRD §16 rules out guilt-based mechanics, and a
streak that shatters the first time someone has a bad week punishes exactly the
users under the most pressure. Milestones pay out; nothing nags.

**Leaderboards are opt-in, enforced in the query.** Someone who never opted in
is not merely hidden from the board — they are not in the result set.

**The feed is chronological.** No engagement ranking, no infinite scroll. A
campus feed does not need an algorithm to be worth reading, and a second
highlight reel would reproduce the comparison dynamic the product is meant to
avoid.

**Resource sharing is scoped away from gradable work.** `RESOURCE_KINDS` has no
value representing a current submission, so the guardrail is the absence of a
code path rather than a policy page nobody reads. Uploads are additionally gated
on recorded acceptance of the sharing policy.

**Offer intel publishes bands, never figures.** Reports carry no author, and
every individual figure — including a track's top offer — is published as a
band. Each account can file at most six reports, counted on the account rather
than the report, so one person cannot set a benchmark.

**The fun is cooperative.** The one shared number on Today is a season goal the
whole batch pushes together; it ranks nobody. "Your impact" turns karma back
into what it stands for — people helped. An offer gets a moment of its own, and
a nudge to leave something behind for next year.

**People own their data.** Profile → Your data downloads everything stored
about the account as JSON, and deletes the account behind a password and a
typed confirmation. Interview questions survive deletion without the name —
they were given to the campus.

**Moderation shipped in version one.** Reporting, a moderator queue, and
hide-don't-delete exist now — before the pressure to loosen anything arrives.
Hidden content stays reviewable, including when the call was wrong.

---

## What is deliberately not built

- **Large file uploads.** Uploads go to Cloudinary but are capped at 4 MB, below
  the request-body limit serverless hosts enforce before any code runs. Anything
  bigger is shared as a link, which the upload dialog offers directly.
- **Calendar-API meeting links.** §6.1 calls for auto-generated Meet/Zoom links
  via calendar integration, which needs per-institute OAuth. Mentors supply a
  standing room link; a booking without one flags that a link is still needed
  rather than silently booking a session nobody can join.
- **Web push.** `notify()` fans out to in-app, realtime and email channels;
  web push is one more `NotificationChannel`, not yet written.
- **SAML and SCIM.** SSO is OIDC (Google, Microsoft). An institute on SAML-only
  identity needs an OIDC bridge, and accounts are provisioned on first sign-in
  rather than pushed by a directory.
- **Anonymous feed posting.** Anonymity exists only where it is narrow and
  moderated: hidden bylines on interview questions, course reviews, and offer
  reports. Each stores enough for a moderator to act.

### Known limitation

Without the Upstash keys, rate limiting is in-process
(`src/lib/api/rate-limit.ts`): each instance keeps its own counters, so the
effective limit scales with instance count. Set `UPSTASH_REDIS_REST_URL` and
`_TOKEN` when running more than one instance.

---

## Verification

`npm run verify` runs typecheck, lint, tests, and a production build. The lint config
includes the React Compiler rules, which are treated as errors rather than
suppressed — no `Date.now()` during render, no synchronous `setState` inside an
effect.

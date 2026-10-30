# MBAAntisocial: agent handoff

This file is for an AI agent (or engineer) picking up this codebase cold. It records:

- what the owner asked for;
- every decision they made;
- what exists now and how it is put together;
- the conventions and traps that cost time;
- exactly what is left, in order.

Read it once end to end before touching code. The original product spec is in
[`docs/PRD.md`](docs/PRD.md), referred to below as "PRD §n".

**Branch:** `feat/full-platform`. Push with `git push -u origin feat/full-platform`.
`main` holds only the preliminary version. No PR has been opened; don't open one unless the owner asks.

---

## Contents

1. [What the owner asked for](#1-what-the-owner-asked-for)
2. [Decisions the owner made (Q&A)](#2-decisions-the-owner-made-qa)
3. [Status at a glance](#3-status-at-a-glance)
4. [Repository layout](#4-repository-layout)
5. [Architecture](#5-architecture)
6. [Conventions you must follow](#6-conventions-you-must-follow)
7. [Module-by-module reference (what is built)](#7-module-by-module-reference-what-is-built)
8. [Running it locally](#8-running-it-locally)
9. [Seed data and test accounts](#9-seed-data-and-test-accounts)
10. [Testing and verification done so far](#10-testing-and-verification-done-so-far)
11. [Known gaps, bugs and debts](#11-known-gaps-bugs-and-debts)
12. [Remaining work, in order](#12-remaining-work-in-order)
13. [Future direction (beyond the current scope)](#13-future-direction-beyond-the-current-scope)
14. [Gotchas log (errors already hit and how they were fixed)](#14-gotchas-log-errors-already-hit-and-how-they-were-fixed)
15. [PRD coverage matrix](#15-prd-coverage-matrix)

---

## 1. What the owner asked for

**Original request (paraphrased closely):**

- Build MBAAntisocial end to end from the PRD, leaving no gaps. A preliminary version already existed in the repo.
- Use only Claude for AI (the owner said "use only Claude Cloud credits"): every AI feature runs on the Anthropic API, and nothing on Gemini or OpenAI.
- Embed Godot-made games: Ludo, chess and other board games.
- Add a Discord-like community product, with Discord integration.
- Build it "in the best possible manner": SOLID principles, scalable, and every listed feature plus whatever else students might need.
- Make the frontend very user-friendly and intuitive.

**Follow-up request, verbatim:**

> "Since it's a website made for students, the student section should feel
> cinematic without adding a lot of loading time. It should have excellent
> animations that are interactive and scroll driven ones as well. Add places,
> but don't overdo anything. For the scroll driven part, you can use 3D objects
> as well, but don't make 3D objects. Take them from revered places. They should
> be great, or they should not be there at all."

**This document's request, verbatim:**

> "Give me a .md file of whatever is there, whatever I asked to build, what you
> have built and the future direction for an AI agent to continue working on
> this project. Make it exhaustive and in depth so the ai has context"

**Product summary (PRD):**

- **What it is:** one app replacing the 8 to 10 tools a B-school student duct-tapes together. Those are WhatsApp groups, spreadsheets, Google Forms, Calendly, Drive, Instagram and the LMS.
- **Modules:**
  - interview and mock practice with seniors (§6.1);
  - a campus-native social layer (§6.2);
  - gamification (§6.3);
  - case competitions, assignments and a task tracker (§6.4);
  - notes sharing (§6.5);
  - alumni, placement tracker, club ops, notification engine, admin and moderation, and a light wellness check-in (§7).
- **Two editions (§15):**
  - **Open Edition** works solo from day one: news, quiz, jargon, opportunities, cross-campus mentors and ROI content.
  - **Campus Edition** unlocks per school once it reaches a density threshold: sessions with real seniors, notes, feed and so on.
- **Engagement without dark patterns (§16):**
  - no guilt-based streak messaging;
  - no infinite scroll;
  - leaderboards are opt-in only;
  - no FOMO notification copy.
- **Guardrails:**
  - no anonymity without moderation tooling;
  - notes and past papers rather than current gradable assignments, behind an honor-code gate;
  - wellness is NOT therapy or crisis response: light check-ins plus a hand-off to real resources.

---

## 2. Decisions the owner made (Q&A)

| Topic | Answer |
|---|---|
| Architecture | Monorepo. Keep **Next.js 16 + MongoDB**. Add `apps/realtime` (Node WebSocket service) and `packages/shared`. |
| Hosting | **Undecided.** It must deploy both ways: Docker (self-host) **and** Vercel plus managed services (Atlas, Upstash/Redis Cloud, a separate realtime host). |
| Platforms | Web **plus native Android and iOS apps** (planned as Expo / React Native) on one shared backend. |
| Godot games | "I've already made them. Just need to embed and ensure the best experience for everyone." Every category and every mode: online, vs bot, pass-and-play, tournaments. |
| Game builds | "Not with me yet." The games use **Godot's built-in networking** (high-level multiplayer: WebRTC/WebSocket peers). The platform must accept their web exports later. |
| Community | Native Discord-like hub **plus** a two-way Discord bridge. |
| Video | "All options. Google Meet/Zoom first." Order: Google Meet, then Zoom, then LiveKit (built in), then Jitsi, then a manual link. |
| Sign-in | "All. But only official emails allowed." That means password, email OTP, Google, Microsoft and LinkedIn SSO, all restricted to an approved institute domain. |
| Editions | Multi-campus from day one, **plus** the Open Edition. |
| Extra student features | All four groups: campus life, academics, money & wellbeing, career. |
| Design | "Keep current look." The existing CSS design system and tokens stay; no redesign. |
| AI | Anthropic Claude only. Default model `claude-opus-5-5` with server-side fallbacks (`betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'`). It can be overridden with `ANTHROPIC_MODEL`. |

Process rules the owner or the environment set:

- **Commits** end with these lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PNJGotYig1XEdXbC1qrgdo
  ```
  (Use your own session URL if you're a different session.)
- Never put model IDs in commit messages, code comments or PR text.
- `AGENTS.md`: this is **Next.js 16**, not the Next.js you know. Read the relevant guide in `node_modules/next/dist/docs/` (at the repo root) before writing Next code.
- Running a downloaded Godot binary in the sandbox was **denied** by the auto-mode safety classifier. Don't retry; validate GDScript in CI instead (see §12).

---

## 3. Status at a glance

| # | Work package | Status | Commit |
|---|---|---|---|
| 1 | Monorepo restructure + `packages/shared` | ✅ done | `1a2f943` |
| 2 | Platform core: ports/adapters, campus registry, auth, realtime, notifications | ✅ done | `8c61915` |
| 3 | Navigation & UX: sections, mobile bar, command palette, edition gate, settings | ✅ done | `de30795` |
| 4 | Interview module: real meetings, GDs, templates, credits, AI practice | ✅ done | `ad6a90a` |
| 5 | Community hub + Discord bridge | ✅ done | `95d10e5` |
| 6 | Games platform (Godot embedding, lobbies, ratings, tournaments, SDK) | ✅ done | `26afb1a` |
| 7a | Academics, money, wellbeing | ✅ done | `597b857` |
| 7b | Campus life: events, clubs, marketplace, lost & found, mess, teams | ✅ done | `2a8ca15` |
| 7c | Cinematic motion layer (scroll-driven CSS, 3D showpieces, view transitions) | ✅ done | `3f68ffb` |
| 7d | Career + Open Edition: company wiki, referrals, insights, briefing, quiz, jargon | ✅ done | `12fb6e3` |
| 7e | Resume studio: builder with print-exact A4 preview, AI bullet rewrites, roaster | ✅ done | `4b5bbac` |
| 7f | Today rework (`/api/today` card providers), time-zone fixes, Open Edition mocks | ✅ done | `c442837` |
| 8 | Admin consoles `/admin` + `/institute/admin`, PRD §9 metrics, audit log, live revocation | ✅ done | `f7dae88` |
| 9 | Native app (Expo SDK 58): Today, Prep, Tasks, Hub chat, More via signed-in web, SSO, push | ✅ done (browser preview and native bundles verified; not yet run on a device) | `b69f29e` |
| 10 | Infra: Dockerfiles, compose, Vercel crons, env templates, CI + smoke suite, setup scripts, README/INSTALL, page titles | ✅ done | `cca09b3` … `fce2d28` |

`next build` passes cleanly (no warnings). Typecheck, lint, 71 unit tests and the
browser smoke suite (`npm run e2e -w @mba/web`) pass. The mobile app type-checks, lints, and exports
Hermes bundles for iOS and Android. Both Docker images were built and
run, and the compose stack was brought up from an empty database, seeded, and exercised
(see §10).

GitHub Actions run on every push. The latest runs are green: `ci.yml` covers
verify, the mobile checks and the e2e smoke suite, and `godot.yml` showed that
Godot 4.4.1 loads the addon cleanly.

---

## 4. Repository layout

```
MBAAntisocial/
├── package.json              # npm workspaces: apps/web, apps/realtime, packages/*
├── tsconfig.base.json
├── AGENTS.md / CLAUDE.md     # "This is NOT the Next.js you know"; read the bundled docs
├── README.md / INSTALL.md    # PRE-DATE this branch; need rewriting (see §12)
├── setup.ps1                 # Windows bootstrap script; needs updating for the monorepo
├── HANDOFF.md                # this file
├── docs/PRD.md               # the product requirements document
├── apps/
│   ├── mobile/               # Expo app (iOS + Android); NOT an npm workspace: own lockfile; see apps/mobile/README.md
│   ├── web/                  # Next 16 App Router: UI + REST API + crons (@mba/web)
│   │   ├── next.config.ts    # security/isolation headers, redirects from legacy paths
│   │   ├── .env.example      # STALE (mentions Gemini/Pusher); rewrite (see §12)
│   │   ├── public/
│   │   │   ├── sw.js                         # hand-written service worker (offline + Web Push)
│   │   │   ├── models/*.glb, *.webp          # optimised 3D showpieces + posters
│   │   │   └── game-builds/<id>/<version>/   # published game web exports (+ published.json)
│   │   ├── scripts/
│   │   │   ├── seed.ts, seed/*.ts            # seed: base + hub, games, campus-life, personal, career
│   │   │   ├── publish-game.ts               # publish a Godot web export into public/game-builds
│   │   │   ├── optimise-model.mjs            # gltf-transform pipeline used for the showpieces
│   │   │   └── load-env.ts
│   │   ├── test/server-core.test.ts          # vitest (KV, rate limiter, crypto)
│   │   └── src/
│   │       ├── proxy.ts              # Next 16 "proxy" (replaces middleware): auth redirect
│   │       ├── app/
│   │       │   ├── (app)/            # signed-in app: every product page
│   │       │   ├── (auth)/           # login, register, forgot/reset password, verify email
│   │       │   ├── api/              # REST routes (see §7)
│   │       │   ├── player/           # cross-origin-isolated Godot host page
│   │       │   ├── mobile/           # native-app SSO/web-login handoffs
│   │       │   ├── files/[...key]/   # disk-storage file server
│   │       │   ├── legal/, offline/
│   │       ├── components/           # UI by domain (ui/, layout/, hub/, games/, academics/, campus/, motion/, …)
│   │       ├── lib/                  # api handler, auth, env, client hooks, gamification, notifications…
│   │       ├── models/               # Mongoose models (root + academics/, campus/, career/, games/, hub/, personal/)
│   │       ├── server/
│   │       │   ├── container.ts      # COMPOSITION ROOT: picks an adapter per port from env
│   │       │   ├── ports/            # ai, email, kv, meetings, push, realtime, storage
│   │       │   ├── adapters/         # concrete implementations per port
│   │       │   ├── modules/          # domain services (hub, games, academics, campus-life, briefing, …)
│   │       │   └── emails/templates.ts
│   │       └── types/model-viewer.d.ts
│   └── realtime/             # Node service (@mba/realtime): Socket.IO + raw WS game endpoints + scheduler
│       └── src/
│           ├── index.ts      # HTTP server, /health, mounts sockets + game WS endpoints
│           ├── config.ts     # zod-validated env
│           ├── bus.ts        # Redis subscriber on channel mba:realtime:events → Socket.IO rooms
│           ├── sockets.ts    # Socket.IO auth (JWT), topic subscribe (authorised by web), presence, typing
│           ├── tokens.ts     # jose JWT verify (user tokens, game tickets, server tokens)
│           ├── web.ts        # calls web /api/internal/* with x-internal-secret
│           ├── scheduler.ts  # in-process cron that pings web /api/cron/* (SCHEDULER_ENABLED)
│           ├── discord.ts    # Discord gateway client for the inbound side of the bridge
│           ├── games/
│           │   ├── signaling.ts  # Godot webrtc_signaling protocol at /games/signal
│           │   ├── relay.ts      # message relay at /games/relay (for games without WebRTC)
│           │   ├── room-hub.ts   # shared room bookkeeping
│           │   └── dedicated.ts  # spawns headless Godot servers, proxies /games/dedicated
│           └── test/games.test.ts
└── packages/
    ├── shared/               # @mba/shared: pure TS consumed as source (no build step)
    │   ├── src/constants.ts  # roles, session types, rubrics, POINT_RULES, BADGES, notification kinds, CAMPUSES…
    │   ├── src/campus.ts     # email-domain rules, FEATURE_EDITION gating, featureAvailable(), slugify
    │   ├── src/hub.ts        # hub permission bitset model + resolution
    │   ├── src/games.ts      # game manifest schema, bridge protocol, Elo rating
    │   ├── src/realtime.ts   # wire contract (topics, event names, payloads)
    │   ├── src/academics.ts  # attendanceOutlook, GPA, grade scales, component maths, clock helpers
    │   ├── src/money.ts      # EMI, loan schedule, months to repay, expense categories
    │   └── test/*.test.ts    # 39 tests
    └── game-sdk/             # @mba/game-sdk
        ├── antisocial-sdk.js             # plain-JS SDK for HTML5 games
        ├── godot/addons/antisocial_sdk/  # Godot 4 addon (plugin.cfg, plugin.gd, antisocial.gd)
        ├── examples/tic-tac-toe/         # reference game (relay online, minimax bot, local)
        └── README.md                     # integration guide for game authors
```

---

## 5. Architecture

### 5.1 Processes

```
 Browser / Native app
   │  HTTPS (REST, SSR)                    │  WSS (Socket.IO + raw WS)
   ▼                                       ▼
 apps/web (Next 16)  ── publish ──►  Redis  ◄── subscribe ──  apps/realtime (Node)
   │  Mongoose                    (pub/sub, KV,                 │  Godot signaling / relay /
   ▼                               rate limits)                 │  dedicated-server proxy
 MongoDB (single node or replica set)                       │  Discord gateway (inbound)
                                                                │  cron pings → web /api/cron/*
 apps/realtime ── POST /api/internal/* (x-internal-secret) ──► apps/web
```

- **Web is the source of truth.** It owns every write. It publishes events to Redis channel `mba:realtime:events`. The realtime service fans each event out to Socket.IO rooms.
- **Topics** (`packages/shared/src/realtime.ts`): `user`, `campus`, `hubServer`, `hubChannel`, `dm`, `gameRoom`, `tournament`. A client may only subscribe to a topic after realtime asks web: `POST /api/internal/realtime/authorize`.
- **Without Redis**, web falls back to `NoopRealtimePublisher` and `MemoryKeyValueStore`. The app still works, just without live updates; rate limits are then per process.
- **Crons:** `/api/cron/{reminders,digest,maintenance,news}` take `Authorization: Bearer $CRON_SECRET` (open in dev).
  - Self-host: the realtime service's `scheduler.ts` triggers them.
  - Vercel: needs `vercel.json` crons. **Not written yet.**

### 5.2 Ports and adapters (`apps/web/src/server/container.ts`)

`container()` is the only place that knows which concrete class backs a port.
Tests swap adapters with `overrideContainer({...})` and restore with `resetContainer()`.

| Port | Adapters (chosen in this order) |
|---|---|
| `ai` | `ClaudeAiProvider` if `ANTHROPIC_API_KEY` is set; otherwise `DisabledAiProvider` (routes return a friendly "AI not configured"). |
| `email` | Resend, then SMTP, then console (logs the email). |
| `storage` | Cloudinary, then disk (`UPLOAD_DIR`, served by `/files/[...key]`). |
| `realtime` | Redis publisher, then noop. |
| `webPush` / `nativePush` | VAPID web-push / Expo push. Both no-op without keys. |
| `kv` | Redis, then in-memory. |
| `meetings` (Map) | Google Meet, Zoom, LiveKit (when configured), then **Jitsi** and **manual** (always present). |

The AI port (`server/ports/ai.ts`) supports:

- streaming text;
- structured output (zod schema);
- `StructuredInput.image` (an image block, used for timetable import);
- PDF documents (resume roast).

Prompts live in `server/modules/ai/prompts.ts`.

### 5.3 The route wrapper (`apps/web/src/lib/api/handler.ts`)

Every API route is built from one of these wrappers:

- `route(options, handler)` for authenticated routes.
- `publicRoute(...)`.
- `internalRoute(...)`: requires the `x-internal-secret` header to equal `INTERNAL_API_SECRET`.
- `cronRoute(...)`.

`route()` options:

- `body` / `query`: zod schemas. Failures return 422 with field errors.
- `rateLimit`: a bucket name from `lib/api/rate-limit.ts`: `register, login, otp, verify, write, post, upload, booking, report, ai, chat, hub, game, search` (plus a few more).
- `requireMentor | requireModerator | requireStaff | requireCampusAdmin | requirePlatformAdmin`.
- `feature`: a `FeatureKey` from `FEATURE_EDITION`. Campus-Edition features answer 403 until the caller's campus unlocks.
- `allowUnverified`: lets accounts with unverified email through. Used for very few routes.

Helpers: `ok`, `created`, `paginationSchema`, `paginate`, `pageMeta`, and `ApiError` (`lib/api/errors.ts`).

The client side uses `lib/client/api.ts` (`api.get/post/patch/put/delete`, `ApiClientError`, `errorMessage`).
Its body is a typed envelope: `{ error: { code, message, details } }`.

### 5.4 Auth, campuses, editions

- **Auth.js v5:** `lib/auth.ts` and `lib/auth.config.ts`. `PUBLIC_PREFIXES` lists the unauthenticated paths, including `/game-builds/`.
  - Credentials and email OTP (`/api/auth/otp`).
  - Google, Microsoft Entra and LinkedIn SSO, rejected unless the email domain belongs to an approved campus. The Entra provider is nOAuth-safe: it uses the `xms_edov` / verified email claim.
- **Campuses:**
  - `models/Campus.ts` plus `server/modules/campus/*`.
  - Each campus has official domains.
  - Lifecycle: `requested`, then `approved`, then `unlocked` (Campus Edition). Unlock is density-based.
  - An unknown domain can request a campus.
  - `ALLOWED_EMAIL_DOMAINS` and `PLATFORM_ADMIN_EMAILS` env vars exist for bootstrap.
  - The campus also stores a `support{counsellorName, counsellorContact, hours, bookingUrl, emergencyContact}` block for the wellbeing page.
- **Editions:**
  - `packages/shared/src/campus.ts` defines `FEATURE_EDITION` (each feature maps to `open` or `campus`) and `featureAvailable(feature, edition)`.
  - The user's edition is `none` (unverified), `open`, or `campus` (campus unlocked).
  - The UI shows locked items with a lock badge and `CampusLocked` explains why. The API enforces it through the `feature` option.
- **Roles** (`packages/shared/src/constants.ts`): `student, mentor, alumni, moderator, placement_office, campus_admin, admin`. Role groups: `MENTOR_ROLES`, `MODERATOR_ROLES`, `STAFF_ROLES`, `CAMPUS_ADMIN_ROLES`.
- **Native-app auth endpoints** (already built, for Task 9):
  - `/api/mobile/auth/login` returns a bearer token.
  - `/api/mobile/auth/exchange`: SSO deep-link code to token.
  - `/api/mobile/auth/web-code` with `/mobile/web-login` opens a web page already signed in.
  - `/mobile/sso` and `/mobile/sso/complete`.
  - `resolveActor` in the handler accepts `Authorization: Bearer` tokens as well as cookies.

### 5.5 Notifications and reminders

- `lib/notifications.ts`: `notify({...})` fans out to in-app (`models/Notification`), realtime (topic `user`), email (only for `EMAIL_WORTHY_KINDS`) and push (web plus Expo).
  - Respects per-category preferences and quiet hours.
  - Categories come from `NOTIFICATION_CATEGORIES` in shared constants.
- `server/modules/reminders/{engine,rules}.ts`: an idempotent reminder engine backed by the `ReminderLog` model. It runs from `/api/cron/reminders`.
  - Rules cover sessions, tasks, comps, game rooms and tournaments (`server/modules/games/reminders.ts`), and events (24h and 1h before, `server/modules/events/reminders.ts`).
- `/api/cron/digest`: daily digest email.
- `/api/cron/maintenance` runs `server/modules/maintenance.ts`, a `SWEEPS` registry. It covers stale game rooms, tournament advancement and similar jobs.

### 5.6 Gamification and credits (two separate economies)

- **Points and karma ledger** (`lib/gamification.ts`, `models/LedgerEntry.ts`):
  - `award(userId, action, {entity})` uses `POINT_RULES` from shared constants. Each rule has `points`, a `track` (`points` for personal productivity, `karma` for giving back) and a `dailyCap`.
  - The ledger's unique index is **partial**: it applies only when `entity` exists. That makes awards idempotent per entity.
  - Other functions: `revoke`, `recordCheckIn` (streaks with `STREAK_GRACE_DAYS = 1`, milestones 3/7/14/30/60/100), `grantBadge`, `evaluateContributionBadges`, `getLeaderboard`.
  - The leaderboard is **opt-in** (PRD §16).
- **Credits** (`server/modules/credits/service.ts`, `models/CreditTransaction.ts`):
  - Earned: `session_hosted` +10, `gd_moderated` +6, `referral_given` +10.
  - Spent: `referral_priority` 15, `priority_booking` 8, `listing_boost` 5.
  - Atomic, and idempotent per entity.

---

## 6. Conventions you must follow

### Next.js 16 specifics (this is where most bugs come from)

- **Route files** (`route.ts`) may export **only HTTP method handlers** (plus route segment config). Helper functions, schemas and types go in `server/modules/**` or `lib/**`. `next build` fails otherwise. `tsc` and `next dev` do NOT catch it.
- **Page files** may export only `default` plus `metadata` / `generateMetadata` / config. No `export function Helper` and no exported interfaces.
- `params` and `searchParams` are **Promises**:
  - server pages: `const { id } = await params`;
  - client pages: `const { id } = use(params)`.
- `useSearchParams()` must sit under a `<Suspense>` boundary.
- `src/proxy.ts` replaces `middleware.ts`.
  - Its matcher excludes `api/`, `_next`, `game-builds/`, `models/`, and **any path with a file extension**. Without that, static `.glb` and `__mv.js` requests got redirected to the login page.
- `app/(app)/template.tsx` wraps pages in React `<ViewTransition>` (it remounts on every navigation).
- `<html data-scroll-behavior="smooth">` is set to silence the Next smooth-scroll warning.
- Read `node_modules/next/dist/docs/` before using any Next API you aren't sure of.

### React Compiler lint (eslint-config-next enforces these)

- No `Date.now()` / `new Date()` during render: use the `useNow()` hook (`lib/client/hooks.ts`).
- No `Math.random()` during render: use a lazy `useState(() => Math.random())`.
- No synchronous `setState` in an effect body.
- Effects must depend on **primitive** keys. An object built in render as a dependency caused an infinite loop in the hub read effect.

### Data and API

- Mongoose 9 with `.lean()`: lean returns plain objects, so a `Map` field comes back as a plain object. Handle both (as `MoneyProfile.categoryBudgets` does).
- `.filter(Boolean)` doesn't narrow types; use `flatMap(x => x ? [x] : [])`.
- Validate every input with zod 4 at the route edge. Throw `ApiError.*` for expected failures.
- Every new user-generated content type must be reportable (`models/Report.ts`, `/api/reports`) and hidden by moderators.
- Groups smaller than `MIN_REPORTABLE_COHORT` (5), or 3 in some charts, are **suppressed** in any aggregate (privacy floor for offers, insights and the campus report).
- DMs are gated by real connections (`lib/connections.ts`): a shared session, team, club, an accepted referral, or an active marketplace listing or lost-item post. **No cold DMs.**

### UI and design system ("keep current look")

- **Styling:** plain CSS Modules plus global tokens in `app/globals.css`. No Tailwind, no component library. `lucide-react` for icons (it has **no brand icons**; use text links for Instagram or LinkedIn).
- **Primitives:**
  - `components/ui/`: `Button`, `Dialog`, `Field` (`Input`/`Select`/`Textarea`), `Display` (`Card`, `Badge`, `EmptyState`, `Segmented`, `Stat`…), `Toast`, `useConfirm`.
  - Reuse them; don't invent new primitives.
- **Navigation:** `components/layout/navigation.ts` is the **single registry**. It drives the sidebar, section landings (`SectionLanding.tsx`), the mobile bottom nav, the full-menu sheet and the Cmd/Ctrl+K palette.
  - Sections: `today, prep, academics, campus, play, discover, me, institute`.
  - Add a page by adding it there, with `feature` and `access` when needed.
- **Client data:** `useApiQuery` (in `lib/client/hooks.ts`) keeps the previous data while refetching the same key, so screens don't flash empty. `useMe()` comes from `lib/client/me.tsx`. Realtime uses `useRealtime` / `useTopic` from `lib/client/realtime.tsx`.
- **Uploads:** `lib/client/upload.ts` `uploadFile()` posts to `/api/upload`, which returns `{url, key}`.
- **Contrast (WCAG AA; the smoke suite enforces it):**
  - Never dim text with `opacity`. Recede with ink instead (`--text-secondary`, `--text-muted`), or dim only icons. This is how done tasks and locked badges work.
  - For status *text*, use `--success-text`, `--danger-text`, `--amber-text`, `--teal-text` or `--rose-text`. The bare tones (`--success`, `--danger`, `--teal`…) are for icons, bars and borders.
  - For white text on a data-chosen colour (server icons, club initials), pass the colour through `backgroundForWhiteText()` in `lib/color.ts`.
  - `--text-muted` is `#6b6876` in light and `#9591a7` in dark. Both reach 4.5:1 on every surface; don't lighten them.
  - Pages render inside a `<main>`. Repeated landmarks (`aside`) carry an `aria-label`. `EmptyState` titles are `h2`.
  - **Headings:** each page renders exactly one `h1`, its `pageTitle`. The shell's top-bar title is a `<p>`. Section headings go `h2`, then `h3`, never skipping a level. A page whose design has no visible title, like the hub, gets an `sr-only` `h1`. The smoke suite fails if a page doesn't have exactly one visible `h1`.
- **Charts:** single hue for a single series, text in text colours (never the series colour), no legend for one series, and small groups suppressed.

### Motion (the "cinematic" layer)

- **CSS scroll-driven animations only:** `animation-timeline: view()` and `scroll(nearest)`.
  - Wrap them in `@supports (animation-timeline: view())` **and** `@media (prefers-reduced-motion: no-preference)`.
  - The app scrolls an **inner container**, not the document, so use `scroll(nearest)`. JS scroll listeners must use document **capture-phase** scroll events.
- Reveal animations animate the individual `translate` / `scale` properties, **not** `transform`, so they compose with the pointer-tilt `transform`.
- **Attributes:**
  - `data-reveal`: fade/slide in on view.
  - `data-hero-recede`: hero shrinks as you scroll.
  - `data-aurora`: animated gradient backdrop.
  - `data-title-in`: title entrance.
  - `data-spot`: cursor spotlight, via `components/motion/Spotlight.tsx`.
- **Shared-element morphs:** `components/motion/Morph.tsx` wraps `<ViewTransition name=… share="morph" default="none">`. Used on games, clubs and events cards to detail pages.
- **3D (`components/motion/Showpiece.tsx`):**
  - Shows a WebP **poster first**.
  - It dynamic-imports `@google/model-viewer` only when the element is in view **and** `canAffordModel()` passes. That check requires all of: no Save-Data, not on 2G/3G, `deviceMemory ≥ 4`, `hardwareConcurrency ≥ 4`, and WebGL2.
  - Scroll orbits the camera; the pointer leans it ±10° and ±4°; dragging hands control to the user, with a reset button.
- **Showpieces in use** (`components/motion/showpieces.ts`):
  - `play` section: `/models/a-beautiful-game.glb` (5.2 MB), "A Beautiful Game" chess set by the MaterialX Project (ASWF); glTF by Ed Mackey; **CC BY 4.0**.
  - `academics` section: `/models/stained-glass-lamp.glb` (2.7 MB), "Stained Glass Lamp" by Wayfair; **CC BY 4.0**.
  - Both come from **KhronosGroup/glTF-Sample-Assets**. Credits are rendered in the UI. **Keep the attribution** if you move them.
- **Rule from the owner:** 3D assets must come from *revered* sources (Khronos samples, Poly Haven, Smithsonian 3D, Sketchfab staff picks with a CC licence). Never model them yourself, and use **none at all** rather than a mediocre one.
  - Poly Haven and the GitHub API were blocked by this sandbox's network policy; `raw.githubusercontent.com` worked.
- **Model optimisation** (`apps/web/scripts/optimise-model.mjs`, gltf-transform):
  - drop stored tangents, then dedup, weld, meshoptimizer `simplify`, prune;
  - textures to WebP;
  - quantise.
  - **Do not** use `instance()`: it produced a "Mesh is missing primitive index association" error in model-viewer.
  - **Do not** use Draco or meshopt compression: their decoders load from a third-party CDN at runtime.

---

## 7. Module-by-module reference (what is built)

Paths below are relative to `apps/web/src` unless noted.

### 7.1 Interview and mock practice (PRD §6.1)

- **Models:** `InterviewSlot`, `SessionTemplate`, `GdSession`, `GdQueueEntry`, `InterviewQuestion`, `CreditTransaction`.
- **Slots and booking:**
  - Mentors publish availability, which auto-generates bookable slots (`lib/scheduling.ts`, `lib/recurrence.ts`).
  - Juniors book. Booking provisions a meeting through `server/modules/sessions/meetings.ts`, using the mentor's chosen provider: Google Meet via Calendar OAuth, Zoom via OAuth, the built-in LiveKit room at `/meet/[room]`, or a standing link, with Jitsi as the final fallback.
  - Cancel and reschedule release or replace the meeting. `CANCELLATION_NOTICE_HOURS = 12`; `MAX_ACTIVE_BOOKINGS_PER_MENTEE = 3`, raised by the `priority_booking` credit.
- **Feedback:**
  - Two-way rubric feedback: `MENTOR_RUBRIC` and `MENTEE_RUBRIC` in shared constants; the route is `/api/sessions/[id]/feedback`.
  - Two-party recording consent on every session.
- **Templates:** crowd-sourced company/round templates (`/api/session-templates`), attached at booking.
- **Cross-campus mentoring:** opted-in mentors are bookable from campuses that allow it, with both campuses' consent checked (`server/modules/sessions/cross-campus.ts`).
- **Group GD:** senior-moderated rooms plus an auto-matching queue that forms a 4 to 8 person room as soon as a window fills (`server/modules/gd/service.ts`, topics in `gd/topics.ts`, `/api/gd`, `/api/gd/[id]`).
- **AI practice (`/practice`):** AI interviewer (`/api/ai/interview`, streamed), simulated GD group (`/api/ai/gd`), structured scorecard (`/api/ai/scorecard`). Shared streaming helper: `lib/client/stream.ts`.
- **Interview intel (`/intel`, `/api/questions`):** crowd-sourced questions by company and round, with freshness (`QUESTION_FRESHNESS_MONTHS = 24`) and upvotes.
- **Pipeline (`/pipeline`, `/api/applications[...]`):** company, rounds, outcomes and deadlines.
- **Offers (`/offers`, `/api/offers`):** anonymous compensation data with a privacy floor.
- **Network (`/network`, `/api/network`):** a private CRM of contacts (`models/Contact`).
- **Integrations (`/api/integrations/[provider]/{connect,callback}`):** Google Calendar, Zoom and Discord OAuth. Tokens are encrypted (`server/modules/oauth-tokens.ts`, `server/crypto.ts` with `ENCRYPTION_KEY`).

### 7.2 Campus social layer (PRD §6.2)

- **Feed (`/feed`, `/api/feed`, `models/Post`):**
  - Campus-scoped and chronological.
  - Page-based (`paginate`/`pageMeta`). **No infinite scroll.** It has no explicit "you're caught up" end-marker yet; adding one is a small task.
  - Reactions `useful/agree/funny/seen_it`; comments; categories.
- **Reviews (`/reviews`, `/api/whispers`, `models/Whisper`):** moderated course and professor reviews, plus "what this professor actually tests". Pseudonymous only behind moderation tooling.
- **Splits (`/splits`):** cab shares and cost splits (`models/Bounty` / the legacy syndicate feature).
- **Opportunities (`/opportunities`, `/api/jobs`, `models/Job`):** club roles, TA positions, live projects.
- **Hub:** see 7.6. **Events, clubs, marketplace, lost & found, mess:** see 7.8.
- **Moderation:** `/institute/moderation` holds the reports queue and hidden content (`/api/reports`, `models/Report`, `lib/report.ts`).

### 7.3 Gamification (PRD §6.3)

See §5.6. Supporting pieces:

- **UI:** `/leaderboard` (opt-in standings), streak and points on Today, badges on profile, `components/CreditsCard.tsx`.
- **Credits:** `/api/credits` reads the balance and spends.

### 7.4 Comps, tasks, CGPA, teams (PRD §6.4)

- **Tasks (`/tasks`, `/api/tasks`, `models/Task`):** assignments, exams, daily habits with recurrence (`daily/weekdays/weekly`), priorities, on-time bonus points.
- **Competitions (`/comps`, `/api/comps`, `models/CaseComp`):** a curated calendar with save and reminders. Auto-scraping is **not** built.
- **Teams (`/teams`, `/teams/[id]`, `/api/teams[...]`, `models/campus/Team`):**
  - "Looking for teammates" posts, skill filters, a team workspace.
  - Each team gets its own **hub server** for chat (`server/modules/campus-life/teams.ts`).
- **Grades (`/grades`):** see 7.7.

### 7.5 Notes and past papers (PRD §6.5)

- **Resources (`/resources`, `/api/resources`, `models/Resource`):**
  - Kinds: class notes, summary, past paper, reading list, slide deck.
  - Course, professor and term tags; upvotes; version history; search.
  - Allowed files: pdf/doc/docx/ppt/pptx/xlsx/md/txt, up to 25 MB.
- **Honor-code gate:** `/legal/honor-code` plus `/api/me/honor-code`. Accepting it is required before uploading. The scope is notes and past papers, **not** current gradable assignments.

### 7.6 Community hub: Discord-like (owner request)

- **Models (`models/hub/`):** `HubServer`, `HubChannel`, `HubMember`, `HubRole`, `HubMessage`, `HubConversation`, `HubReadState`, `HubInvite`, `HubJoinRequest`, `HubBan`.
- **Servers:**
  - Kinds: campus (auto-created per campus), club, circle, course, team.
  - Roles with a permission bitset and channel permission overwrites. The model is in `packages/shared/src/hub.ts`, resolved in `server/modules/hub/access.ts` and `message-access.ts`.
  - Invites, join requests, timeouts and bans.
- **Channels:** text, announcement, forum, voice.
- **Messages:** threads, pins, reactions, mentions, slow mode, "marked answer" in forums, live typing. Edit and delete.
- **DMs and group DMs** (`server/modules/hub/dm.ts`), gated by connections.
- **Voice:** LiveKit rooms per voice channel (`/api/hub/channels/[id]/voice`, `server/modules/hub/voice.ts`). The UI is `VoiceStage` in `HubApp.tsx`.
- **Discord bridge:**
  - Outbound: channel webhooks.
  - Inbound: the Discord gateway in `apps/realtime/src/discord.ts` POSTs to `/api/internal/hub/discord-inbound`.
  - Configured per channel at `/api/hub/channels/[id]/discord`, with the server's Discord channels listed via `/api/internal/hub/discord-channels`.
  - Needs `DISCORD_CLIENT_ID/SECRET/BOT_TOKEN`.
- **UI:**
  - Components in `components/hub/`: `HubApp.tsx` (server rail, channel and DM sidebars, thread/pins/members panel, create-server and new-DM dialogs), `Conversation.tsx`, `MessageItem.tsx`, `Composer.tsx`, `ServerSettingsDialog.tsx`.
  - Pages: `/hub`, `/hub/[serverId]`, `/hub/[serverId]/[channelId]`, `/hub/dm`, `/hub/dm/[conversationId]`, `/hub/explore`, `/hub/invite/[code]`.
  - Single-pane on mobile.
- **API:** `/api/hub/**` (servers, channels, messages, reactions, read, unread, roles, members, invites, requests, explore, dm).
- **Seed:** `scripts/seed/hub.ts`.

### 7.7 Academics, money, wellbeing (owner's "extras")

- **Shared maths** (`packages/shared/src/academics.ts`, `money.ts`):
  - `attendanceOutlook` (classes you can skip, classes you must attend, best and worst case, recoverable);
  - `GRADE_SCALES` (4.33 / 4.0 / 10-point), `gpa`, `summariseComponents`, `neededOnRemaining`;
  - `parseClock`, `weekdayIndex`, `overlaps`;
  - `emi`, `loanSchedule` (moratorium simple interest, capitalised or paid), `monthsToRepay`, `EXPENSE_CATEGORIES`.
- **Models:**
  - `academics/`: `Course` (credits, grade components, attendance requirement), `ClassSlot` (weekday, start, end, room), `AttendanceMark`.
  - `personal/`: `MoneyProfile` (stipend, loan terms, `categoryBudgets` Map), `Expense`, `CheckIn` (mood, energy, `STRESSORS`, private note).
  - `User` gained `academicSettings{gradeScale, currentTerm}` and `calendarFeedVersion`.
- **Services:** `server/modules/academics/service.ts` (`dayKeyIn`, `gradePoints`, `courseOverview`, `todaysClasses`, `validateWeights`) and `schemas.ts` (including `extractedTimetableSchema`).
- **Academics API** (`/api/academics/...`): overview, `courses[/id]`, `slots[/id]`, `attendance`, `settings`, `import`, and `import/apply`.
  - `import` is **AI timetable import**: upload an image or PDF of the timetable and Claude extracts structured slots. The user reviews them, then `apply` saves.
- **Money and wellbeing API:** `/api/money` (GET/PUT), `/api/money/expenses[/id]`, `/api/wellbeing`.
- **Calendar feed:**
  - `/api/calendar/token` (GET, or POST to rotate) and `/api/calendar/feed/[userId]/[sig]`, an HMAC-signed ICS URL.
  - `server/modules/calendar/{ics,feed,providers}.ts` holds a provider registry: timetable as weekly RRULEs, sessions, tasks, events. Add more with `registerCalendarProvider`.
- **Wellbeing:**
  - `server/modules/wellbeing/support.ts` lists Indian helplines: Tele-MANAS 14416, KIRAN, iCall, Vandrevala, and emergency 112.
  - It also holds `supportSuggestion()` (gentle, non-clinical) and the campus counsellor block.
  - **Not therapy, no crisis triage.** Keep it that way (PRD §7, §13.B).
- **Pages:** `/timetable`, `/attendance`, `/grades`, `/money`, `/wellbeing`. Components are in `components/academics/` and `components/personal/`.

### 7.8 Campus life

- **Models (`models/campus/`):**
  - `Event`: RSVPs, waitlist, `checkInCode`.
  - `Club`: members with roles, recruitment, budget lines, tasks, linked `hubServer`.
  - `ClubApplication`.
  - `Listing` (marketplace), `LostItem`.
  - `MessMenu` (`MEALS`), `MessRating`.
  - `Team`.
- **Services (`server/modules/campus-life/`):**
  - `events.ts`: RSVP with waitlist promotion, `checkIn`, `cancelEvent`, `canManageEvent`, `viewEvent`, `peopleFor`.
  - `clubs.ts`: `createClub` creates a club hub server; adding or removing a member syncs to the hub.
  - `teams.ts`, `listings.ts`.
  - `search.ts`: command-palette search provider.
- **API:**
  - `/api/events[/id]`.
  - `/api/clubs`, `/api/clubs/[slug]`, `/api/clubs/[slug]/applications`.
  - `/api/marketplace[/id]`: boost spends the `listing_boost` credit.
  - `/api/lost-found[/id]`.
  - `/api/mess`: GET, PUT the menu, POST a rating.
  - `/api/teams[/id]`.
- **Pages:**
  - `/events`, `/events/[id]`.
  - `/clubs`, `/clubs/[slug]`, with tabs: about, members, applications, budget, tasks.
  - `/marketplace`, `/lost-found`, `/mess`, `/teams`, `/teams/[id]`.
- **Components (`components/campus/`):** `EventDialog`, `clubs.tsx` (`ClubLogo`, `CLUB_CATEGORY_LABEL`), `PhotoPicker`, `MessageButton`.

### 7.9 Career and Open Edition (PRD §7, §15A)

- **Models (`models/career/`):**
  - `CompanyPage`: wiki sections overview/process/roles/prep/culture, revision history capped at 60.
  - `ReferralRequest`, `NewsItem`, `Quiz` (`QuizDay`, `QuizAttempt`), `JargonTerm`, `Resume`.
- **Company wiki** (`/companies`, `/companies/[key]`, `/api/companies[/key]`): PUT edits a section and awards `wiki_edited` karma.
- **Alumni and referrals:**
  - `/alumni`, `/api/alumni`, `/api/alumni/referrals[/id]`.
  - Alumni opt in, with boundaries (capacity per month, topics).
  - Statuses: requested, accepted, referred, declined. `referral_priority` credit boosts a request; the alum earns `referral_given` credits.
- **Insights (`/insights`, `/api/insights`):** placement outcomes and skills-over-pedigree content, with privacy floors.
- **Daily briefing:**
  - `/briefing`, `/api/briefing`, and `/api/cron/news` (RSS ingest).
  - `server/modules/briefing/{rss,service}.ts`. Feeds are configured by `NEWS_FEEDS`. `istDay()` keys the day in IST.
- **Daily quiz:**
  - `/quiz`, `/api/quiz`. Five questions a day.
  - Generated from the briefing by Claude, falling back to a curated bank (`briefing/bank.ts`, 20 questions).
  - Submitting feeds the streak.
- **Jargon buster:**
  - `/jargon`, `/api/jargon`, `/api/ai/jargon`.
  - The curated glossary (`jargon/curated.ts`, 25 terms) is checked first; Claude explains unknown terms, and those explanations are upserted into the glossary.
- **Resume:** see §12, step 2. The backend exists:
  - `models/career/Resume.ts` (`ResumeData`, `resumeToText`);
  - `/api/resume` (GET returns a draft prefilled from the profile; PUT saves);
  - `/api/ai/bullet` (structured output: rewritten bullet options plus "missing detail" prompts);
  - `/api/ai/roast`, which accepts `{pdfUrl, target?}` or `{text, target?}` (text is 80 to 12,000 chars) and streams.
  - The current `/resume` page is the **old roaster UI**; it still works with the PDF upload.

### 7.10 Games platform (owner request)

- **Catalog** (`server/modules/games/catalog.ts`), 20 games:
  - ludo, chess, carrom, snakes-and-ladders, checkers, reversi, four-in-a-row, sea-battle, dots-and-boxes;
  - crazy-eights, rummy, hearts, bluff;
  - trade-empire, market-maker (dedicated server);
  - jargon-duel, guesstimate-showdown;
  - tic-tac-toe, sudoku, memory-match.
  - Each entry has category, modes (online/bot/local/solo), player counts, transport (`webrtc` / `relay` / `dedicated`), and art.
  - **Only Tic-Tac-Toe has a playable build.** The rest show "coming soon" until a build is published.
- **Registry** (`registry.ts`): layers the catalog, then `public/game-builds/published.json` (written by `publish-game`), then `GameRelease` docs (CDN releases). Each instance caches the merged catalog. Publishing or rolling back bumps `games:generation` in KV, and every instance checks it at most every 5 s, so a release reaches all instances within about 5 s. A 10-minute TTL is only a backstop.
- **Rooms** (`rooms.ts`, `models/games/GameRoom.ts`):
  - Create, join by code, spectate, leave, ready, kick, add bot, start.
  - Invite friends; quick match by rating, campus first and then cross-campus.
  - Presence via realtime.
  - `bridgeInitForRoom` builds the payload the player page sends to the game.
- **Results** (`results.ts`):
  - Peer-to-peer games: each client reports and the result needs **majority consensus**.
  - Dedicated servers report with a server-token JWT (`use: 'game-server'`) to `/api/games/server-report`.
  - Also: forfeit on leave, solo results, multiplayer Elo via `rateMatch` (shared `games.ts`), `GameMatch` history, and completion points.
- **Tournaments** (`tournaments.ts`, `models/games/Tournament.ts`): knockout (seeded by rating) and round robin. Rooms open per round, no-shows forfeit, champion awards and reminders; swept by maintenance.
- **Player page:** `/player/[gameId]` (layout `app/player/layout.tsx`), served with COOP/COEP isolation so Godot threads work.
  - `components/games/GamePlayer.tsx` hosts the export in an iframe and speaks the **postMessage bridge** (protocol in `packages/shared/src/games.ts`).
  - It also handles tickets, pause, mute, theme, wake lock, full screen, orientation lock, the mobile-data warning and the result overlay.
- **Tickets:** JWTs signed with `REALTIME_SECRET` (`use: 'game'`). Peer ids: host = 1, seat n = n + 2. Verified at `/api/games/verify-ticket` and in realtime.
- **Realtime endpoints:**
  - `/games/signal` speaks Godot's `webrtc_signaling` demo protocol, so stock `WebRTCMultiplayerPeer` code works.
  - `/games/relay` is a message relay.
  - `/games/dedicated` spawns headless Godot servers from `GAME_SERVERS_DIR` with a port range, max process count and idle timeout. `GODOT_BIN` must be set.
- **SDK** (`packages/game-sdk`):
  - **Godot 4 addon** (`godot/addons/antisocial_sdk/antisocial.gd`, autoload "Antisocial"): reads the bridge init and sets up a WebRTC mesh, the relay or the dedicated client.
    - It sends `_antisocial_auth` RPC to dedicated servers and exposes `verify_ticket` and `server_report_result`.
    - Signals enum is named `Sig` (not `Signal`, which clashes with a builtin).
    - **Never run inside Godot**: see §11.
  - **Plain-JS SDK** `antisocial-sdk.js` for HTML5 games.
  - Reference game `examples/tic-tac-toe` (relay online, minimax bot, local).
  - `README.md` is the guide for game authors.
- **Publishing:**
  ```
  npm run publish-game -w @mba/web -- --id ludo --dir /path/to/godot/web-export --version 1.0.0 \
    [--threads|--no-threads] [--server-pack /path/to/server.pck] [--transport webrtc|relay|dedicated] \
    [--thumbnail img.png] [--cdn https://cdn.example.com] [--with-js-sdk]
  ```
  - It copies the export to `public/game-builds/<id>/<version>/` (immutable cache, COOP/COEP/CORP headers via `next.config.ts`) and updates `published.json`.
  - Server packs go to `game-servers/` at the repo root and are **never** public.
- **API:** `/api/games`, `[id]`, `rooms`, `rooms/quick`, `rooms/code`, `rooms/[id]`, `rooms/[id]/session`, `rooms/[id]/result`, `solo`, `history`, `server-report`, `verify-ticket`; `/api/tournaments[/id]`; `/api/internal/games/{room,presence}`.
- **Pages:** `/play` (section landing with the chess showpiece), `/games`, `/games/[id]`, `/games/room/[id]`, `/tournaments`, `/tournaments/[id]`.

### 7.11 Search, settings, profile, onboarding

- **Command palette** (`components/layout/CommandPalette.tsx`): ranked page matches plus `/api/search`. The search is pluggable: providers in `server/modules/search/providers.ts`, plus hub, games and campus-life providers.
- **`/settings`:** per-category notifications, email/push channels, browser push enrolment, quiet hours, time zone, connected accounts (Google Calendar, Zoom, Discord), visibility, theme and account.
- **Profiles:** `/profile` (own) and `/u/[id]` (public, with book/referral/message actions).
- **Other pages:** `/onboarding`, `/me`, `/discover`, `/campus`, `/academics`, `/prep`, `/play` (section landings), `/institute` (staff landing), `/institute/report` (privacy-floored campus report), `/institute/moderation`.
- **`/api/admin/stats`** exists (basic platform stats); there is **no admin page** yet.

---

### 7.12 Added after the first handoff

- **Resume studio** (`/resume`):
  - Code: `components/resume/{Builder,BulletList,ResumeSheet,Roaster}.tsx` and `resume.module.css`.
  - Shape, limits, `resumeToText` and the offline `bulletHints` live in `@mba/shared/resume` (tested); the route and model use the shared zod schema.
  - The preview is an A4 sheet laid out in real units and measured with a `ResizeObserver`, so the one-page check matches print.
  - Print uses a portal into `[data-print-root]`, plus global print CSS with a named `@page sheet` in `globals.css`.
  - Builder and roaster stay mounted across tabs; the roaster reads the live draft through `getDraft`.
  - `components/Markdown.tsx` safely renders AI output and is reused by AI practice.
- **Today** (`/home`, `GET /api/today`):
  - `server/modules/today/service.ts` is a registry of card providers: classes, tasks, agenda, briefing, quiz, check-in, events, comps, games, openEdition.
  - Each declares a `feature` (and an optional `when`), loads in parallel with `Promise.allSettled`, and is reported in `failed` instead of breaking the page.
  - Add a card by adding a provider. The UI is in `components/today/`.
- **Time zones** (`lib/time.ts`): `dayKeyIn`, `zoneOffsetMs`, `startOfLocalDay`, `localDayBounds` (DST-safe), `addDays`, `weekdayOfKey`.
  - Recurring tasks (`lib/recurrence.ts`) are due at the end of the *user's* day.
  - The tasks summary uses the same local day.
  - Use these helpers for any "today" logic; servers run in UTC.
- **Open Edition mocks:**
  - Mock sessions is gated `cross_campus_mentors` (open) in the nav and the API.
  - Own-campus listing and booking still need `sessions` (Campus Edition) and are checked server-side.
  - The page shows only Open slots and My bookings for Open users.
- **Admin:**
  - `server/modules/admin/{metrics,campuses,people,releases,audit}.ts` and `models/AuditLog.ts`.
  - Routes: `/api/admin/{overview,campuses,people,games,audit}` (platform admin) and `/api/institute/{campus,people,metrics,audit}` (campus admin or staff).
  - UI: `components/admin/*`.
  - The permission rule is the pure function `refusal()` in `people.ts`.
  - Release validation merges the overlay into the catalog entry and parses it with `gameManifestSchema` before saving. Asset bases must be HTTPS or `/game-builds/…`.
- **Live revocation** (`server/modules/auth/authz.ts`):
  - Session and app tokens live for up to 30 days, so role, campus, verification and suspension are re-read on every request through a 60 s KV cache.
  - Admin actions, verification and onboarding call `invalidateAuthz`.
  - Any new code that changes those fields must call it too.
- **Accessibility:** danger `Banner`s have `role="alert"`.

### 7.13 Native app (`apps/mobile`)

- **Stack:** Expo SDK 58 with expo-router (routes in `src/app`), React Native 0.88, React 19.3, and the React Compiler on.
- **Not an npm workspace:** it has its own `package-lock.json`. Run npm inside `apps/mobile`. For native modules use the versions from `expo/bundledNativeModules.json`, since `npx expo install` needs Expo's API, which this sandbox blocks.
- **`@mba/shared`** comes through a `file:` link; `metro.config.js` watches `packages/shared`. The Today contract is in `@mba/shared/today` and is used by both apps.
- **Navigation:** native tabs (`components/app-tabs.tsx`, `NativeTabs` with `sf`/`md` icons) and a web-preview bar (`app-tabs.web.tsx`). The root `Stack` uses `Stack.Protected` guards to switch between `sign-in` and the app.
- **Auth** (`src/lib/auth.tsx`):
  - Password or OTP via `/api/mobile/auth/login`.
  - SSO via `WebBrowser.openAuthSessionAsync(APP_URL/mobile/sso?provider=…, 'mbaantisocial://auth')`, then `/api/mobile/auth/exchange`.
  - The token is stored with `expo-secure-store` (`localStorage` on web).
  - **The bearer is handed to the API client synchronously in `adopt()`**, because child effects run before parent effects and an effect would be too late.
  - A 401 on any authenticated call signs the user out.
- **Screens:**
  - Today renders `/api/today`.
  - Prep uses `/api/sessions`, with a cross scope on the Open Edition.
  - Tasks uses `/api/tasks`; habit instances are hidden until due. Adding a task offers one-tap deadlines (No date, Today, Tomorrow, then the next five days), each due at 23:59 local. This deliberately avoids a native date picker; exact times are set on the web.
  - Hub uses `/api/hub/servers`, `/servers/[id]` and `/dm`; chat goes to `/channels/[id]/messages` or `/dm/[id]`, with `useTopic` live updates and `canSend` respected.
  - More opens web pages through `app/web.tsx` (`/api/mobile/auth/web-code`, then `/mobile/web-login?code=…&next=…&embed=1`).
- **Hub badge** (`src/lib/unread.ts`, `useHubBadge`): counts mentions plus unread DMs from `/api/hub/unread`. Quiet channel traffic deliberately doesn't count (PRD §16, no nagging). It refetches, debounced to 1.5 s, on:
  - `hub.activity` on every server topic you belong to;
  - `dm.message.created` on your user topic (your own messages are ignored);
  - the app returning to the foreground;
  - navigation, because opening a chat marks it read.
  - It appears as `NativeTabs.Trigger.Badge` on device and as a counted pill in the web-preview bar.
  - `useTopics` in `src/lib/realtime.tsx` subscribes to many topics at once; `useTopic` wraps it.
- **Embed mode:** `web-login?embed=1` sets an `mba-embed` cookie, and `(app)/layout.tsx` passes `embedded` to `AppShell`, which drops the sidebar, top bar and bottom nav.
- **Push** (`src/lib/push.ts`): needs `extra.eas.projectId` (`eas init`). Taps route through `src/lib/links.ts`, which maps a web `href` to a native screen and falls back to the web screen.
- **CORS for the web preview:** `API_CORS_ORIGINS` (web env) adds exact-origin CORS for `/api/*` without credentials. Next anchors `has` values as `^…$`, and the origin is regex-escaped.
- **Icons** are rendered from the brand mark (`components/brand/Logo.tsx`) with sharp. The generator lives in the session scratchpad; regenerate with the same SVG if the brand changes.

## 8. Running it locally

The quick paths are now `./setup.sh --seed` / `setup.ps1 -Seed` and `docker compose up -d --build` (see README and INSTALL). The manual steps below still work. Env templates: `apps/web/.env.example` and `apps/realtime/.env.example`. The realtime service loads its own `.env`.

**Prerequisites:** Node ≥ 20.9, Docker (for MongoDB and Redis).

```bash
# 1. Databases. No code uses transactions or change streams today, so a single node works;
#    the dev setup ran a replica set (rs0) so transactions can be adopted without re-provisioning.
docker run -d --name mba-mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec mba-mongo mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
docker run -d --name mba-redis -p 6379:6379 redis:7

# 2. Install
npm install            # at the repo root (workspaces)

# 3. Env: apps/web/.env.local (minimum)
MONGODB_URI=mongodb://localhost:27017/mba?replicaSet=rs0
AUTH_SECRET=<npx auth secret>
APP_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
REALTIME_SECRET=<random 32+ chars>          # shared with apps/realtime
INTERNAL_API_SECRET=<random 32+ chars>      # shared with apps/realtime
NEXT_PUBLIC_REALTIME_URL=http://localhost:4000
ANTHROPIC_API_KEY=<optional; AI features disabled without it>

# 4. Seed + run
npm run seed           # wipes and seeds (see §9)
npm run dev            # web on :3000
cd apps/realtime && npx tsx src/index.ts   # realtime on :4000 (health: GET /health)
#   realtime env: AUTH_SECRET, REALTIME_SECRET, INTERNAL_API_SECRET, REDIS_URL,
#   WEB_INTERNAL_URL=http://localhost:3000, CORS_ORIGINS=http://localhost:3000
```

### Environment variables

`apps/web/src/lib/env.ts` validates these at boot.

| Group | Variables |
|---|---|
| Core | `MONGODB_URI`, `MONGODB_DB_NAME`, `AUTH_SECRET`, `APP_URL`, `ENCRYPTION_KEY` |
| Campus bootstrap | `ALLOWED_EMAIL_DOMAINS`, `PLATFORM_ADMIN_EMAILS` |
| Realtime | `REDIS_URL`, `REALTIME_SECRET`, `NEXT_PUBLIC_REALTIME_URL`, `INTERNAL_API_SECRET` |
| Cron | `CRON_SECRET` |
| AI | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Email | `RESEND_API_KEY`, `SMTP_URL`, `EMAIL_FROM` |
| Storage | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `UPLOAD_DIR` |
| Push | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `EXPO_ACCESS_TOKEN` |
| SSO | `AUTH_GOOGLE_ID/SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER`, `AUTH_LINKEDIN_ID/SECRET` |
| Meetings | `GOOGLE_CALENDAR_CLIENT_ID/SECRET`, `ZOOM_CLIENT_ID/SECRET`, `JITSI_BASE_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Discord | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` |
| Games | `GAME_ICE_SERVERS` (JSON array of STUN/TURN servers for WebRTC) |
| News | `NEWS_FEEDS` (comma-separated RSS URLs; built-in defaults otherwise) |

Realtime (`apps/realtime/src/config.ts`): `PORT`, `HOST`, `REALTIME_SECRET`, `AUTH_SECRET`,
`INTERNAL_API_SECRET`, `WEB_INTERNAL_URL`, `REDIS_URL`, `CORS_ORIGINS`, `APP_URL`, `CRON_SECRET`,
`SCHEDULER_ENABLED`, `GODOT_BIN`, `GAME_SERVERS_DIR` (default `../../game-servers`),
`GAME_SERVER_PORT_MIN/MAX`, `GAME_SERVER_MAX_PROCESSES`, `GAME_SERVER_IDLE_SECONDS`, `DISCORD_BOT_TOKEN`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next dev (Turbopack) for `@mba/web` |
| `npm run dev:realtime` | realtime service |
| `npm run typecheck` / `lint` / `test` | all workspaces |
| `npm run build` | all workspaces (**`next build` not yet verified**) |
| `npm run seed` | seed the database |
| `npm run verify` | typecheck, then lint, then test, then build |
| `npm run publish-game -w @mba/web -- …` | publish a game build |

---

## 9. Seed data and test accounts

`npm run seed`, via `apps/web/scripts/seed.ts` and `scripts/seed/index.ts`, runs the base seed and then the modules
`hub`, `games`, `campus-life`, `personal` and `career`. It builds the **IIM Ahmedabad** campus
(domain `iima.ac.in`, Campus Edition unlocked).

**Every account's password is `seedpassword123`.**

| Account | Role / what it's good for |
|---|---|
| `placements@iima.ac.in` | Institute staff: campus report |
| `ananya@iima.ac.in` | Senior, moderator: moderation queue |
| `priya@iima.ac.in` | Senior mentor: completed session with feedback |
| `sneha@iima.ac.in` | Junior: bookings, tasks, overdue item, timetable, money, check-ins (the best all-round demo account) |
| `arjun@`, `rohit@`, `karthik@`, `meera@`, `tanvi@`, `devansh@iima.ac.in` | Other students and mentors (hub members, game players, club members) |
| `kabir@iimb.ac.in` | Open Edition first-year (IIM Bangalore is `open`): cross-campus mocks, no campus features |
| `vikram@`, `aisha@`, `rahul@alumni.iima.ac.in` | Alumni: referrals (Vikram has a pending request to mark "referred") |
| `admin@iima.ac.in` | Platform admin (role `admin`); emails in `PLATFORM_ADMIN_EMAILS` are also promoted |

The seed creates:

- a hub with campus, club and circle servers;
- game rooms, ratings and a tournament;
- events, clubs (e.g. `finclub`), marketplace listings, lost items, the mess menu and teams;
- courses, slots and attendance for Sneha;
- six alumni stories, two wiki pages, glossary terms and two referrals.

---

## 10. Testing and verification done so far

**Automated (all committed):**

- `packages/shared`: 47 vitest tests (campus, hub permissions, games/Elo, academics, resume).
- `apps/web/test`: 25 tests:
  - `server-core`: KV, rate limiter, crypto;
  - `today`: local-day bounds, including across a DST change;
  - `admin`: who may change whom, the privacy floor, audit diffs;
  - `color`: darkening a colour just enough for white text.
- `apps/realtime/src/test/games.test.ts`: signaling and relay integration.
- `apps/web/e2e/smoke.mjs`: a 12-check browser suite against a seeded instance:
  - wrong-password refusal;
  - Today;
  - resume autosave;
  - core pages;
  - admin API guards;
  - admin metrics;
  - phone overflow;
  - an axe-core WCAG 2.1 A/AA pass plus a one-`h1` check over 10 pages in light and dark, with reduced motion so scroll reveals are settled.
  - It fails on any page error, any 5xx, and any serious or critical axe violation.
- **CI** (`.github/workflows/ci.yml`) runs on every push, on pull requests and on demand, with three jobs:
  - `verify`: typecheck, lint, tests and both builds;
  - `mobile`: the Expo app's typecheck and lint, plus iOS and Android bundles;
  - `e2e`: the smoke suite against a seeded production build.
  - First green run: `41042855502`.
- **Godot CI** (`godot.yml`) runs on pushes that touch `packages/game-sdk`. It imports the SDK project in headless Godot 4.4.1 and fails on any script or parse error. First green run: `41042855439`: the `Antisocial` autoload and the plugin load with no errors.

**Verified by hand in a browser (Playwright scripts in the session scratchpad):**

- **Hub:** live messaging, threads, DMs, explore, create server.
- **Games:** two-player Tic-Tac-Toe over the relay with consensus and Elo; vs bot; a tournament round advancing.
- **Academics and campus:** all pages. One-tap attendance from Today.
- **Calendar:** the ICS feed returns 31 events with RRULEs.
- **Career:** pages, quiz submit, the referral flow.
- **Resume studio:**
  - prefill, Enter/Backspace bullets, offline hints, autosave plus reload;
  - overflow warning;
  - the PDF comes out as exactly 1 A4 page when it fits and 2 when it doesn't, matching the on-screen check;
  - mobile edit/preview.
- **Today:** junior, mentor and Open Edition views; no horizontal overflow at 390 px.
- **Open Edition** (`kabir@iimb.ac.in`, now in the seed): cross-campus slots listed and bookable; own-campus listing returns 403.
- **Admin consoles:**
  - approve a campus;
  - grant campus admin;
  - suspend (the target's very next API call returns 401) and reinstate;
  - self-demotion refused;
  - HTTP CDN refused;
  - publish a release, which the player sees, then roll it back;
  - audit log entries;
  - campus admin limited to campus roles and their own campus, with platform APIs returning 403;
  - the counsellor block appears on students' wellbeing page.
- **Production:**
  - `next start` and the standalone Docker image: headers, uploads written as the non-root user, sign-in, Today.
  - Compose from an empty database: the replica set initiates via the healthcheck; `tools` seeds; the realtime scheduler gets 200s from every cron endpoint.

- **Native app (web preview at 390×844, against the real API):**
  - sign-in;
  - Today, with one-tap attendance (`aria-checked`);
  - Prep, Tasks and Hub;
  - #announcements shows read-only, a message posted in #general appears;
  - More → Resume studio opens signed in, with no web chrome;
  - zero console or API errors.
  - `expo export` produced Hermes bundles for iOS (2.9 MB) and Android (3.2 MB).

- **Tab titles on detail pages** come from the record (`server/modules/meta/titles.ts`), e.g. "Ludo · MBAAntisocial" and "Finance & Investment Club · MBAAntisocial". Unknown ids keep the section's title. Signed out, the page redirects without naming anything. Records from another campus are never named.
- **Hub badge (native app, web preview, live):**
  - a DM from another user and an @mention each update the Hub tab within about 2 s;
  - opening the DM decrements the count;
  - replying in the channel clears it;
  - no API errors.
- **Admin metrics cache:** a repeat load is served from KV in about 10 ms with the same `computedAt`. "Recompute now" (`fresh=<n>`) recomputes, and the console shows when the figures were computed.

**Not exercised:**

- AI calls (no Anthropic key in the sandbox; the error path was verified).
- Real Google Meet / Zoom / Discord / Resend / Expo push.
- Live RSS fetching (blocked here).
- LiveKit voice.
- Dedicated Godot servers.
- The native app on a real device or simulator, native SSO, or push delivery (needs an EAS project).

---

## 11. Known gaps, bugs and debts

1. **The native app has not run on a device or simulator.** Only the web preview and the Metro bundles were checked. See §12, step 1.
2. **The owner's real Godot games are not published.** Each needs:
   - a web export with the addon;
   - `publish-game` (or Admin → Games for a CDN build);
   - a bridge check.
   - Transport: `webrtc` for `WebRTCMultiplayerPeer`, `relay` or `dedicated` for `WebSocketMultiplayerPeer`.
3. **`docs.expo.dev` is outside this sandbox's network allowlist.** SDK 58 APIs were taken from the installed packages' type definitions. Allow the domain to follow the template `AGENTS.md`'s advice to read the versioned docs.
4. **Not exercised end to end:**
   - Discord bridge against real Discord;
   - Meet/Zoom OAuth against real apps;
   - Expo push, Resend;
   - AI features with a real key.
5. **News RSS** couldn't be fetched in the sandbox. The quiz uses the curated bank fallback here.
6. **The realtime scheduler and Vercel crons** must not both run in one deployment (`SCHEDULER_ENABLED`). Documented in INSTALL.
7. **Perf:** measure LCP/INP on real devices. The two GLBs (5.2 MB and 2.7 MB) load only on capable devices, after the poster.

**Resolved since the first handoff:**

- **Godot addon:** CI has parsed it.
- **Detail pages:** they now show the record's name as the tab title.
- **Play again / rematch:** this was a dead link (`?again=1` was never read).
  - It's now `rematchRoom` (room action `rematch`). The first player to press it opens a private lobby with the same game, size, options and bots. The finished room points at it (`GameRoom.rematch`), so later presses from the overlay or the room page join that table. Other players are invited and see "X wants a rematch" through the `game.room.rematch` event.
  - Tournament matches show "Back to the bracket" instead.
  - Verified with two players: rematch, join, a second full game, and the tournament path including bracket advance.
  - The web `useTopic` gained `onSubscribed`, which runs after every confirmed subscribe or reconnect. The lobby uses it to refetch, so a player who sits down before the subscription lands still shows up.
- **Game releases across instances:** they now propagate through a KV generation counter. Verified with two `next start` instances on one Redis: the other instance served a new release after 4.9 s and the rollback after 5.1 s.
- **Admin overview:** cached in KV for five minutes per campus and window. The metrics are read by `cachedSuccessMetrics` in `server/modules/admin/metrics.ts`, which both consoles use.

---

## 12. Remaining work, in order

Each step ends with `npm run verify`, `npm run e2e -w @mba/web` against a seeded
`next start`, a browser check of what changed, and a commit with the trailer from §2,
then a push. Commit in small steps: this environment's worker has restarted several
times mid-task.

### Step 1: Put the native app on devices

1. `cd apps/mobile && npx eas-cli@latest init` to create the EAS project and `extra.eas.projectId`.
2. Run `eas build --profile development` for iOS and Android, then install on devices.
3. Point `EXPO_PUBLIC_API_URL` at a reachable web app (LAN IP or staging).
4. Check each of these on a device:
   - SSO round trip through `mbaantisocial://auth`;
   - push registration and a tapped notification routing to its screen;
   - games in the WebView (`SharedArrayBuffer` on Android; prefer `--no-threads` exports);
   - the keyboard over the chat composer;
   - native tab icons.
5. Then add, as needed:
   - native booking notes and template choice;
   - an exact-time picker for tasks, only if people ask for it (`@react-native-community/datetimepicker@9.2.1`, per `expo/bundledNativeModules.json`; it needs a development build).
   - Unread badges and one-tap task deadlines are done (§7.13).

### Step 2: Small follow-ups

1. Allow `docs.expo.dev` and re-check the app against the SDK 58 docs (gap 3).
2. With an Anthropic key: try every AI surface once and tune prompts in `server/modules/ai/prompts.ts`. The surfaces are the interviewer, GD simulator, scorecard, roast, bullet rewrites, timetable import, quiz generation and jargon.

---

## 13. Future direction (beyond the current scope)

Ideas that fit the PRD and the owner's "whatever students might need". Treat them as a backlog, not commitments.

- **Open Edition growth (PRD §15):**
  - sponsor-funded competitions with prizes (sponsor model, judging flow);
  - a public landing page with an Open-Edition sign-up for students whose campus isn't unlocked;
  - a referral loop that brings in batch-mates and pushes a campus towards the density unlock.
- **ROI and employability (§13.A):**
  - comparative placement data across campuses (privacy-floored);
  - skill roadmaps per role track;
  - a "skills over pedigree" learning path that links to free resources.
- **Comps:** auto-aggregation from public sources (RSS, sitemaps, where allowed) to replace manual curation (PRD §6.4 V3); cross-campus comp leaderboards (§6.3 V3).
- **LMS/ERP sync:** an ICS import of the institute calendar, or a Moodle/Canvas connector for deadlines (§6.4 V3). The calendar provider registry is the extension point.
- **Institute partnership (B2B2C, §10):** official rollout tools, contribution certificates (§6.3 V3), and an engagement dashboard (from the metrics in step 4).
- **Cross-campus feed / discovery (§6.2 V3):** opt-in only, after moderation scales.
- **Anonymous posting (§6.2 V3):** only with the reporting tooling already in place, plus rate limits and a moderator de-anonymisation audit trail.
- **AI, Claude only:**
  - PI prep from the student's own resume;
  - auto-tagging and summarising of notes;
  - smarter quiz generation from the day's briefing;
  - hub message summarisation ("what did I miss");
  - mock-interview feedback from LiveKit recordings, only with two-party consent.
  - Keep the `ai` port the only entry point; model choice stays env-driven.
- **Games:**
  - seasonal campus leagues;
  - inter-campus tournaments;
  - spectator chat in the hub;
  - game-specific achievements;
  - a GameRelease canary channel.
- **Offline / PWA:** cache Today, the timetable and tasks for offline viewing in the service worker.
- **Accessibility:** automated contrast and landmark checks are done and enforced (§10). Still to do: a manual keyboard and screen-reader pass over the hub and games.
- **Scale:**
  - move uploads to S3-compatible storage (write an adapter);
  - shard realtime with the Socket.IO Redis adapter;
  - MongoDB Atlas search for notes and wiki full-text search.

**Engagement rules (PRD §16) stay non-negotiable in every future feature:**

- no guilt-based streak copy;
- no infinite feeds;
- leaderboards opt-in;
- no FOMO notifications;
- wellness never becomes therapy or crisis response.

---

## 14. Gotchas log (errors already hit and how they were fixed)

| Symptom | Cause | Fix |
|---|---|---|
| `next build` / route type error on `export function validateWeights` and similar | Next 16 forbids non-handler exports from `route.ts`/`page.tsx` | Moved helpers into `server/modules/**` (`serialiseSlot` → `server/modules/sessions/serialise.ts`; `ClubLogo` → `components/campus/clubs.tsx`) |
| Infinite render loop in the hub read effect | effect depended on an object rebuilt each render | depend on `readId` / `readKind` primitives |
| React Compiler: impure function in render | `Date.now()` / `Math.random()` in render | `useNow()` hook / lazy `useState` initialiser |
| Money API 500 | `.lean()` returns a Map field as a plain object | handle both shapes |
| `.glb` and `__mv.js` redirected to `/login` | proxy matcher caught static files | matcher excludes any path with an extension, plus `models/` and `game-builds/` |
| model-viewer: "Mesh is missing primitive index association" | gltf-transform `instance()` | removed instancing from the pipeline |
| 3D framing wrong | model-viewer clamps `radius` when `auto` | percentage radius plus `min-camera-orbit` and a per-model aspect ratio |
| Poster showed a progress bar | model-viewer default | `--progress-bar-height: 0` |
| Scroll orbit never fired | the app scrolls an inner container, not `window` | document capture-phase scroll listener; CSS uses `scroll(nearest)` |
| Reveal fought the hover tilt | both animated `transform` | reveal animates `translate`/`scale` individually |
| GDScript enum `Signal` | clashes with the builtin `Signal` type | renamed `Sig` |
| Mongoose filter union type errors | strict typing of `$or` filters | type as `Record<string, unknown>` |
| Lucide `Instagram` / `Linkedin` missing | lucide removed brand icons | text links |
| Playwright smoke not repeatable | seeded state already "going", etc. | made checks tolerant of prior state |
| Next warning about smooth scrolling | `scroll-behavior: smooth` on html | `data-scroll-behavior="smooth"` on `<html>` |
| Poly Haven / GitHub API downloads failed | sandbox network policy | used Khronos assets via `raw.githubusercontent.com` |
| Running Godot binary denied | auto-mode classifier ("code from external") | don't retry; validate in CI |
| Lock state flashed "campus" for Open users | fallback edition | fallback is `me ? me.edition : 'campus'` (only while `me` loads) |

| `next build` failed on `../app.module.css` in institute pages | pages moved a folder deeper; only the production build resolves every page | `../../app.module.css`; run `next build` after moving pages |
| Disk storage pulled the whole project into the `/files` trace | `path.resolve(process.cwd(), dir)` | `/* turbopackIgnore: true */` before `process.cwd()` |
| Build type error inside `.next/dev/types/routes.d.ts` | dev server killed mid-write | delete `apps/web/.next/dev` |
| Campus admin page crashed on `support.counsellorName` | `.lean()` skips schema defaults; old rows lack the block | serialisers merge defaults (`serialiseCampusProfile`) |
| Suspended or demoted users kept access | role and suspension trusted from 30-day token claims | `currentAuthz()` re-reads with a 60 s cache plus `invalidateAuthz()` |
| Daily habits due at 5:29 AM IST | recurrence used the server's (UTC) day | `lib/time.ts` local days |
| `.stack` style ignored inside a CSS module | global utility classes get hashed in modules | `:global(.stack)` |
| Horizontal scroll on every page with a greeting | aurora `::before` extended 10% past the right edge | `inset: -30% 0 auto 0` |
| Class rows overflowed narrow columns | fixed flex row | container query on `.dayList` |
| Playwright `page.pdf()` printed the whole app | the test had emulated `screen` media | emulate `null`/print before `pdf()` |
| `pkill -f "next dev"` killed the tool's own shell | the pattern matched the shell's command line | start servers from scratchpad launcher scripts; kill by pid |
| `docker build` npm "Exit handler never called" (sandbox only) | containers can't reach the agent proxy or trust its CA | `--network host`, proxy build args, and a derived Dockerfile that installs `/root/.ccr/ca-bundle.crt` via `--build-context ccr=/root/.ccr` (see the session scratchpad `docker/`); the committed Dockerfiles stay clean |
| Docker Hub 429 on image pulls (sandbox) | rate limit | retry later, or use cached images |
| CI web build: `next/font/google queries have exactly one entry` (Turbopack) | The CSS Google Fonts served the runner broke the font loader (the parent commit had passed an hour earlier) | Fonts are committed in `apps/web/src/app/fonts` and loaded with `next/font/local`, so builds make no font requests and work offline. Don't go back to `next/font/google`. |

| axe reports contrast failures on cards that look fine | scroll-driven `[data-reveal]` cards below the fold sit at their opacity-0 first frame | audit with `reducedMotion: 'reduce'` (the smoke suite does) |
| Done tasks and locked badges failed contrast | dimmed with `opacity` | recede through ink colours instead; see §6 Contrast |

---

## 15. PRD coverage matrix

Legend: ✅ built · 🟡 partial · ⬜ not built

| PRD item | Status | Where |
|---|---|---|
| §6.1 Availability → slots, session types, auto meeting links | ✅ | sessions, `server/modules/sessions/meetings.ts` |
| §6.1 Reschedule/cancel with notice rules | ✅ | `/api/sessions/[id]` |
| §6.1 Rubric feedback both ways, two-way rating | ✅ | `/api/sessions/[id]/feedback` |
| §6.1 V2 Credits, recording consent, group GD auto-match, templates | ✅ | credits, GD, session templates |
| §6.1 V3 Cross-campus mentors, AI interviewer | ✅ | `cross-campus.ts`, `/practice` |
| §6.2 Campus feed, posts/photos, comments, reactions | ✅ | `/feed` |
| §6.2 V2 Circles, marketplace, event RSVP + calendar sync | ✅ | hub circle servers, `/marketplace`, `/events` plus the ICS feed |
| §6.2 V3 Cross-campus feed | ⬜ | future |
| §6.2 V3 Anonymous posting (with moderation) | 🟡 | moderated pseudonymous reviews only |
| §6.3 Points, streaks, opt-in leaderboard | ✅ | `lib/gamification.ts`, `/leaderboard` |
| §6.3 V2 Karma track, badges, credits across modules | ✅ | `POINT_RULES` karma, `BADGES`, credits |
| §6.3 V3 Cross-campus comp leaderboards, certificates | ⬜ | future |
| §6.4 Task tracker, comps calendar, daily recurring tasks | ✅ | `/tasks`, `/comps` |
| §6.4 V2 Team formation, team workspace, CGPA calculator | ✅ | `/teams`, `/grades` |
| §6.4 V3 Auto-scraped comps, LMS sync | ⬜ | future |
| §6.5 Notes upload/search, ratings, tags, versions | ✅ | `/resources` |
| §6.5 V2 Prof tips, past papers, karma incentive | ✅ | `/reviews`, resource kinds, karma |
| §6.5 Honor-code guardrail | ✅ | `/legal/honor-code` gate |
| §7 Alumni mentorship & referral tracker | ✅ | `/alumni` |
| §7 Placement tracker plus crowd-sourced questions | ✅ | `/pipeline`, `/intel`, `/companies` |
| §7 Club ops (recruitment, budgets, tasks) | ✅ | `/clubs/[slug]` |
| §7 Central notification/reminder engine | ✅ | `lib/notifications.ts`, reminders engine |
| §7 Admin/moderation dashboard | ✅ | `/institute/moderation`, `/institute/admin`, `/admin` with an audit log |
| §7 Wellness check-in with hand-off | ✅ | `/wellbeing` |
| §9 Success metrics | ✅ | `/admin` overview and `/institute/admin` (`server/modules/admin/metrics.ts`) |
| §13.D Loan EMI / stipend budgeting | ✅ | `/money` |
| §15 Open Edition (news, quiz, jargon, opportunities, cross-campus mentors, ROI) | ✅ | `/briefing`, `/quiz`, `/jargon`, `/insights`, `/opportunities` |
| §15 Campus Edition density unlock | ✅ | campus lifecycle plus `FEATURE_EDITION` |
| §15 Sponsor-funded competitions | ⬜ | future |
| §16 No dark patterns | ✅ | enforced by design (see §6, §13) |
| Owner: Godot games, all modes, tournaments | ✅ platform / ⬜ owner's builds | §7.10 |
| Owner: Discord-like hub plus bridge | ✅ | §7.6 |
| Owner: Meet/Zoom first, all video options | ✅ | meetings port |
| Owner: SSO plus official emails only | ✅ | §5.4 |
| Owner: native iOS/Android | ✅ | `apps/mobile` (device runs pending, §12) |
| Owner: Docker and Vercel deployable | ✅ | Dockerfiles, `docker-compose.yml`, `apps/web/vercel.json`, INSTALL §6 |
| Owner: cinematic motion with revered 3D | ✅ | §6 Motion |
| Owner: resume builder | ✅ | `/resume` |

# Product Requirements Document: MBAAntisocial

**Status:** Draft v0.2 — added market research, competitive deep-dive, and two-version strategy
**Owner:** [You]
**Last updated:** August 2026

---

## 1. One-liner

A single app that replaces the 8-10 disconnected tools (WhatsApp groups, spreadsheets, Google Forms, Calendly, Google Drive, Instagram, generic LMS) a B-school student currently duct-tapes together to survive their two years — covering interview prep, academics, community, and campus social life.

## 2. Problem Statement

A typical MBA/PGDM student juggles, in parallel:
- Cold-calling seniors on WhatsApp for mock interviews, with no structure, no slot system, and no way to give/receive feedback
- Tracking 6-8 courses' worth of assignments and deadlines across Excel, notes apps, and memory
- Hunting for case competitions across 10 different websites and WhatsApp forwards
- A note-sharing culture that lives in scattered Google Drive links with no version control or search
- A campus social life that's fragmented between Instagram (public, curated, not campus-specific) and closed WhatsApp/Discord groups (no discovery, no memory)
- No structured, incentivized way for seniors/alumni to *want* to help juniors beyond goodwill

**Why now:** placement pressure, GDPI-style admissions/rounds culture (India-specific but generalizable), and case-competition culture have all intensified, but the tooling students use hasn't evolved past forums and spreadsheets.

## 3. Target Users / Personas

| Persona | Need |
|---|---|
| **Junior (1st year)** | Structured mock interview/GD practice, notes, deadline tracking, "how do things work here" |
| **Senior (2nd year) / Mentor** | A low-friction way to give back without being flooded by 40 individual WhatsApp DMs |
| **Alumnus** | Occasional, boundaried mentorship — not another LinkedIn inbox |
| **Club/Committee lead** | Event promotion, RSVP, team formation for comps |
| **Institute admin (later persona)** | Visibility into engagement, optional official rollout |

## 4. Competitive Landscape (why this is still a gap)

- **InsideIIM / PaGaLGuY** — strong at content, forums, and aggregated placement/exam resources at the *industry* level, but not built as a day-to-day, campus-internal operating layer for a student's own batch and seniors.
- **Unstop** — good aggregator for external case comps/hackathons, not connected to a student's internal coursework, notes, or peer-interview workflow.
- **LinkedIn** — public, resume-brained, not designed for the "give a stranger-senior 30 minutes of blunt feedback" use case.
- **WhatsApp/Discord + Google Drive + Calendly** — this is the real incumbent. It works, but has zero structure, discovery, or incentive design.

**The gap:** nothing combines *scheduled peer/senior interaction* + *academic operations* + *campus-native social* + *incentive design* in one place, scoped to a student's own school (with an optional cross-campus layer later).

## 5. Positioning Note (on the name)

"Antisocial" reads as a deliberate wink — not anti-community, but anti-*performative-LinkedIn*. Worth deciding early whether this becomes an explicit brand pillar: more irreverent/authentic tone, less "personal brand," more "actually useful and a little funny." This should inform copywriting and the social module's tone (see 6.2) — e.g., leaning into candid peer feedback and memes rather than curated highlight reels.

## 6. Feature Modules

Each module below is written as **MVP / V2 / V3+** so scope stays visibly open, per your ask. Treat V2/V3 as a backlog, not a commitment.

### 6.1 Peer & Senior Interview / Mock Practice Platform
*(your feature #1, expanded)*

**MVP**
- Mentor/senior availability calendar → auto-generated bookable slots
- Session types: Mock Interview, Mock GD, Resume Review, General Q&A (extensible list)
- Zoom/Google Meet/Teams auto-link generation on booking (via calendar API integration, not manual link-pasting)
- Reschedule/cancel flow with notice-period rules
- Post-session structured feedback form (rubric-based, not just free text) shown to both parties
- Two-way rating (junior rates senior's usefulness; senior rates junior's preparedness — keeps quality bidirectional)

**V2**
- "Credit" system: seniors earn credits for hosting sessions, redeemable for gamification perks (see 6.3) or priority in their own asks (e.g., resume review from an alum)
- Session recording with explicit two-party consent, for self-review only
- Group mock GD room scheduling (4-8 person GD practice, auto-matched)
- Company/round-specific templates (e.g., "Consulting case interview," "Marketing PI") crowd-sourced by past interviewees

**V3+**
- Cross-campus senior network (opt-in) — e.g., a junior at one B-school books an alum from another
- AI-assisted mock interviewer as a fallback when no human slot is available (careful: positioned as supplement, not replacement)

### 6.2 Campus-Native Social Layer
*(your feature #2, expanded)*

**MVP**
- Feed scoped to your own campus/batch by default (not global from day one — solves the cold-start problem)
- Posts, photos, campus meme culture, club/event promotion
- Comments + reactions

**V2**
- Interest-based "circles" (sports, hobbies, startups, specific electives) for discovery beyond your immediate friend group
- Campus marketplace (secondhand books, subletting, cycle sales)
- Event RSVP + calendar sync for fests, guest lectures, corporate visits

**V3+**
- Cross-campus feed/discovery (opt-in), useful once case-comp and interview modules already create cross-campus relationships
- Anonymous/pseudonymous posting for sensitive topics (placement anxiety, course reviews) — **flag:** this needs real moderation tooling and reporting flows before it ships; anonymity features are a common vector for harassment on campus apps and should not be MVP.

### 6.3 Gamification
*(your feature #3, expanded — this is the connective tissue across every other module rather than a standalone feature)*

**MVP**
- Points for: completing daily tasks, hosting/attending mock sessions, sharing notes, on-time assignment tracking
- Streaks (Duolingo-style) for daily habits — most naturally applied to current-affairs/GK reading, which matters for PI rounds
- Simple leaderboard (batch-level, opt-in — don't force public ranking on everyone)

**V2**
- "Karma" specifically for *giving* (mock sessions hosted, notes shared, questions answered) as a separate track from personal-productivity points — this is what makes seniors want to keep participating
- Badges/titles tied to specific accomplishments (e.g., "Case Comp Finalist," "5 Mocks Hosted")
- Credits redeemable across modules (interview slot priority, marketplace listing boosts)

**V3+**
- Cross-campus leaderboards for case comp participation
- Institute-recognized certificates/transcripts for contribution (only if an institute partnership exists)

### 6.4 Case Comps, Assignments & Daily Task Tracker
*(your feature #4, expanded)*

**MVP**
- Personal assignment tracker with deadlines, course tagging, reminders
- Aggregated external case-competition calendar (manually curated at first) with save/reminder
- Daily recurring task support (e.g., "read business news," "revise GK") — feeds streaks in 6.3

**V2**
- Case comp **team formation**: post "looking for teammates," filter by skill/interest, form a team in-app
- Shared team workspace per case comp (docs, task split, deadline)
- Grade/CGPA calculator per course

**V3+**
- Auto-scraped case comp aggregation from known sources (Unstop-style feeds) rather than manual curation
- Integration with campus LMS/ERP for deadline auto-sync (institute-dependent, later-stage)

### 6.5 Peer Notes & Assignment Sharing
*(your feature #5, expanded)*

**MVP**
- Upload/search notes by course, professor, term
- Ratings/upvotes on note quality
- Basic tagging and version history

**V2**
- Professor- and course-specific tips ("what this professor actually tests")
- Previous-term exam paper repository
- Karma-linked incentive for high-quality contributions (ties to 6.3)

**V3+**
- **Guardrail to design in early, not bolt on later:** note-sharing is healthy; raw assignment-sharing risks enabling plagiarism/academic-integrity violations. Consider scoping this module to *notes and past exams* rather than *current, gradable assignment submissions*, or add an honor-code gate/instructor visibility toggle if assignment sharing stays in scope.

## 7. Modules Not in Your Original List (worth considering for the open backlog)

| Module | Why it fits |
|---|---|
| **Alumni mentorship & referral tracker** | Distinct from senior interviews — longer-horizon relationship, referral-request tracking, boundaried contact rules |
| **Placement/internship application tracker** | Company-wise prep notes, round-by-round status, crowd-sourced interview questions per company |
| **Club/committee ops tools** | Recruitment forms, event budgets, member task tracking — clubs are a huge chunk of B-school life and currently run on spreadsheets |
| **Notification/reminder engine** | Cross-cutting, not a "feature" per se, but needs to be designed once, centrally, not per-module |
| **Admin/moderation dashboard** | Required the moment UGC (posts, notes, anonymous content) ships at any scale |
| **Wellness check-in (light-touch, non-clinical)** | Peer support nudges only, with a clear hand-off to real counseling resources — **do not build this as a therapy or crisis-response feature**; keep it to light, optional peer-support prompts |

## 8. Phased Roadmap (suggested, not final)

**Phase 1 (MVP) — one campus, prove the core loop**
Interview scheduling core → Campus feed (basic) → Assignment/task tracker → Notes sharing → Points + streaks

**Phase 2 — deepen engagement & incentives**
Karma system → Case comp team formation → Marketplace → Club tools → Alumni tracker

**Phase 3 — network effects**
Cross-campus interview network → Cross-campus case comp leaderboards → Institute partnerships/admin dashboard

## 9. Success Metrics (draft — needs your input on targets)

- % of batch that books ≥1 mock session per term
- Senior participation rate (unique mentors hosting sessions / total seniors)
- Weekly active users on the social feed vs. Instagram/WhatsApp cannibalization (self-reported)
- Notes repository coverage (% of courses with ≥1 note set)
- Streak retention (7-day, 30-day)

## 10. Monetization (options, not a decision)

- **B2B2C**: license to the institute (placement cell subsidizes it as official infra) — likely the strongest long-term path given the workflow depth
- **Freemium**: core scheduling/tracker free, premium for advanced analytics, priority mentor slots, or cross-campus access
- **Sponsored case comps / recruiter partnerships**: companies pay to run comps or interview-prep content in-app
- Explicitly **not recommended**: ads on the social feed early on — undermines trust in a small, closed community

## 11. Key Risks

| Risk | Mitigation |
|---|---|
| Senior burnout from too many session requests | Credit-gated request limits, opt-in availability windows |
| Anonymous features → harassment | No anonymity in MVP; add only with reporting/moderation tooling in place |
| Assignment-sharing → academic integrity issues | Scope to notes/past papers first; gate current assignments behind honor code |
| Cold start (no seniors on platform yet) | Launch single-campus, recruit a founding batch of senior mentors before junior-facing launch |
| Feature sprawl (everything in one app) | Keep MVP ruthlessly narrow (6.1 + basic 6.3/6.4/6.5); resist shipping 6.2's full social layer until core loop retains users |

## 12. Open Questions (need your call before this gets tighter)

- Single campus first, or building for multi-campus from day one?
- Web app, mobile app, or both for MVP?
- Is there an institute partnership angle, or purely bottom-up student adoption?
- How central is the "Antisocial" irreverent tone to brand identity — does it shape feature design (e.g., anonymous confessions) or just marketing copy?
- Sequencing: launch the Open Edition first to solve cold start (see §15), or go campus-first with one founding partner school?
- Should sponsor-funded case comps/prizes (BTribe-style) be part of monetization from day one, or added later once there's a user base worth offering sponsors?

---

## 13. Market Research: Problems Beyond the Current Scope

You asked to look at what students are struggling with even outside the five features already scoped. Grouped by theme:

**A. Employability / ROI anxiety — the single biggest, fastest-growing one**
Even elite programs are seeing this: a recent report found 23% of one top program's MBA graduates were still job-hunting three months after graduation, up from 20% the year before and 10% two years earlier, with several major employers pulling back on MBA hiring. In India, the picture is sharper for the long tail of B-schools: India has over 3,000 MBA colleges of uneven quality, and industry commentary attributes weak outcomes to outdated curricula, minimal industry exposure, and hiring slowdowns. One estimate suggests students spending roughly ₹5-8 lakh on a program can end up earning only ₹15,000-20,000 a month afterward — a completely different anxiety from "how do I ace this interview," and one that hits your tier-2/3 addressable market (much bigger than the top-20 schools) hardest. This is arguably a bigger unmet need than anything in your original five features.

**B. Mental health & stress**
Indian survey data from 2025 across eight major cities found the majority of students showing moderate-to-high anxiety, depression, and distress, and a government task force on student suicides was formed in late 2025 after petitions from families. MBA-specific: research on Indian MBA students found placement season itself is a distinct stress event, with female students, non-engineering graduates, and students without a family-business background affected more than their peers. This is real and worth being aware of, but it is **not** something to build a therapy or crisis-response feature around — see the wellness note in §7, which deliberately scopes any related feature to light peer-support nudges plus a hand-off to real resources, not clinical intervention.

**C. Loneliness despite constant connectivity**
Gen Z reports being the loneliest generation by a wide margin — one estimate puts it at 67% classified as lonely, ahead of every older cohort — despite being the most digitally "connected" generation ever. This directly informs how the social module (§6.2) should be built: a highlight-reel public feed risks reinforcing the exact comparison-culture dynamic that's contributing to this, rather than solving it. The instinct to scope it as campus-only, small, and low-stakes (already in the MVP) is the right one — it should stay that way even under pressure to "make the feed more Instagram-like."

**D. Financial stress**
Gen Z financial insecurity reportedly jumped from 30% to 48% in a single year per one large global workplace survey, compounding academic and career pressure. A lightweight, B-school-specific angle here (loan EMI planning, internship-stipend budgeting) isn't in your original five features but could be a genuinely differentiated addition — none of the competitors below touch it.

**E. Career-direction confusion & AI disruption**
Direction uncertainty is now compounded by generative AI reshaping which entry-level roles exist at all, and by rising use of AI tools to shortcut coursework — directly relevant to the notes/assignment-sharing module (§6.5), where an honor-code guardrail is worth designing in from day one rather than retrofitting after a plagiarism incident.

**F. Outdated curriculum / skill gap**
The most consistently cited complaint across sources: curriculum lag and low practical exposure at less-resourced B-schools, with employers increasingly screening for demonstrated skills over degree pedigree. This is precisely the gap BSmart/BTribe and Unstop are both already trying to fill — see below.

## 14. Competitive Deep-Dive

| Player | Core model | Key features | What they don't do |
|---|---|---|---|
| **BSmart (Business Standard) / BTribe** | Content + engagement app for B-school students, largely sponsor-funded | Curated business news, weekly quizzes, jargon explainers, polls, audio/video content, sponsor-funded live case competitions with cash prizes, brand-film competitions, interview/resume prep zone, bundled premium news subscription, exclusive recruiter-partnered job/internship listings | No peer/senior interview scheduling, no notes-sharing, no campus-specific social layer; engagement is episodic (a quiz, a case) rather than a daily habit loop |
| **Unstop** (formerly Dare2Compete) | Open opportunity marketplace + employer hiring platform | Competitions/hackathons/case comps across industries, internships & jobs, skill assessments, a large mentor network, daily-progress badges, campus ambassador program | Not campus-specific — one giant open marketplace, not built around your own batch or seniors; mentorship is generic rather than tied to your school's actual interview/placement process; no notes or assignment tracking |
| **Viral Fission** | Youth network + brand marketing/campus-ambassador agency | Campus ambassador programs, brand activations and internships, community-led marketing campaigns reaching thousands of campuses | Not an academic or interview-prep tool at all — closer to a marketing layer than a student utility; useful mainly as proof that "campus ambassador-led growth" works at scale |
| **InsideIIM / PaGaLGuY** | Content + forums, industry-wide | Long-form career content, mock tests, alumni webinars, competition listings, batch/school-wise forums | Forum-style and read-heavy, not workflow-native — no scheduling, no structured personal tracker |

**The pattern:** every one of these is either a content/opportunity firehose that looks the same for every student regardless of school, or an open forum. None of them is the day-to-day *operating layer* for one specific batch — booking a senior's actual time, tracking your own assignments, finding your own classmates' notes. That gap is still what your original five features (§6.1–6.5) target. It's also exactly why the two-version approach you proposed makes structural sense — see next section.

## 15. Two-Version Product Strategy

**Version A — "Open" Edition** (plays in BSmart/BTribe/Unstop's territory, but functions as your acquisition engine)
- Curated business news, weekly quizzes, jargon explainers — habit-loop content, not a link dump
- Case comp / internship / opportunity aggregation, sponsor-funded competitions with real prizes
- Cross-campus mentor marketplace (any senior/alum, not just your own school)
- Employability/ROI content aimed squarely at the tier-2/3 anxiety surfaced in §13.A — comparative placement data, skills-over-pedigree guidance
- Works for a solo user on day one — no network density required, which is what makes it viable as the top of the funnel

**Version B — "Campus" Edition** (where your original five features + gamification core live)
- Needs real density to work: interview scheduling with actual seniors, notes from actual classmates, a feed of people you actually know
- Unlocks progressively per school as it crosses a minimum-density threshold — mirrors early Facebook's campus-by-campus rollout
- This is where deep retention actually lives; the Open Edition's job is to get someone in the door and prove value fast, the Campus Edition's job is to make it indispensable once enough of their batch is on it

**Why this sequencing matters:** cold start is already flagged as your single biggest risk (§11). The Open Edition sidesteps it entirely — it doesn't need thirty of your friends already signed up to be useful on day one. Realistic path: launch Open Edition broadly, use it to build brand recognition and a user base (and to recruit founding senior-mentors, solving the "no seniors yet" problem before Campus Edition even launches at a given school), then light up Campus Edition school-by-school once each one crosses a minimum-viable-density threshold.

## 16. Engagement Design: Real Habit, Not Dark Patterns

You asked for this to be "addictive." Worth being precise about what that should mean, given what §13 turned up: this population already shows elevated anxiety and comparison-culture strain tied to the apps already in their life. A second Instagram-style comparison feed would replicate that problem rather than solve it — and would also undercut the "Antisocial" positioning (§5) that's meant to be the differentiator. The good news: you don't need manipulative mechanics to build a real habit loop, because the workflow itself already supplies one honestly —

- **Trigger:** a real, recurring reason to open the app — a deadline reminder, a daily quiz, a streak about to lapse, a senior's slot opening up
- **Action:** one tap — book, answer, check
- **Variable reward:** the natural "did I get picked / did someone reply / did I place" uncertainty already present in case comps, mentor responses, and notes upvotes — nothing needs to be artificially manufactured
- **Investment:** streaks, karma, and a growing session/notes history — each use makes the next one more valuable, which is what produces durable retention rather than a novelty spike

**Worth avoiding, specifically because of what §13 surfaced:** guilt-based streak-loss messaging, infinite-scroll feeds with no natural stopping point, non-opt-in public leaderboards (comparison culture is a documented stressor for exactly this demographic), and FOMO-driven notification copy. These tend to inflate short-term engagement metrics while quietly adding to the same burnout your own market research just found — and are the fastest way for a product named "MBAAntisocial" to end up living down to the wrong half of its name.

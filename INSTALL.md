# Installing MBAAntisocial on a new computer

Complete setup for a fresh Windows machine. Follow it top to bottom; the
checklist in step 6 confirms nothing was missed.

**Time:** about 20 minutes, most of it downloads.

---

## 1. Install the tools

| Tool | Version | Download | Notes |
| --- | --- | --- | --- |
| Node.js | 20.9 or newer (LTS) | https://nodejs.org | npm comes with it |
| Git for Windows | Latest | https://git-scm.com | Keep the default "Git from the command line and also from 3rd-party software" option, so PowerShell can find `git` |
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop | Runs MongoDB. Not needed if you use MongoDB Atlas instead |

After installing, **close and reopen** your terminal, start **Docker Desktop**,
and check:

```powershell
node --version     # v20.9.0 or higher
git --version
docker --version
```

---

## 2. Get the project

Choose one.

### Option A: from the transfer zip (recommended)

The zip includes your `.env.local` (secrets) and full git history.

1. Copy `MBAAntisocial-transfer.zip` to the new computer (USB or a private
   channel; it contains secrets).
2. Right-click → **Extract All** to a folder such as `D:\Antigravity\`.
3. Open PowerShell in the project folder:
   ```powershell
   cd D:\Antigravity\MBAAntisocial
   ```

### Option B: from GitHub

```powershell
git clone https://github.com/19otherrsh-dot/MBAAntisocial.git
cd MBAAntisocial
```

`.env.local` is not on GitHub. Copy it over separately, or let the setup
script create a fresh one (step 3).

---

## 3. Run the setup script

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Seed -Verify
```

It runs these steps in order and stops with a clear message if one fails. It is
safe to re-run.

| Step | What it does |
| --- | --- |
| Tools | Confirms Node 20.9+, Git and Docker |
| `.env.local` | Creates it from `.env.example` with a fresh `AUTH_SECRET` if missing; validates `MONGODB_URI` and `AUTH_SECRET`; lists which optional features are off |
| MongoDB | If the URI is local, starts a Docker container `mba-mongo` (data kept in volume `mba-mongo-data`, auto-restarts with Docker). Skipped for Atlas |
| Dependencies | `npm ci`: installs the exact versions in `package-lock.json` |
| `-Seed` | Loads a sample campus (optional) |
| `-Verify` | Typecheck, lint and production build (optional) |

Ends with **Setup complete**. Yellow notes are informational (usually
integrations without keys); red failures need fixing before re-running.

<details>
<summary>Doing it by hand instead</summary>

```powershell
docker run -d -p 27017:27017 --name mba-mongo -v mba-mongo-data:/data/db --restart unless-stopped mongo:7
Copy-Item .env.example .env.local    # skip if you brought .env.local from the zip
npx auth secret                      # then make sure AUTH_SECRET in .env.local is set
npm ci
npm run seed                         # optional
npm run verify                       # optional
```

</details>

---

## 4. Start the app

```powershell
npm run dev
```

Open **http://localhost:3000**.

If you seeded, every account's password is `seedpassword123`:

| Account | Role |
| --- | --- |
| `sneha@iima.ac.in` | Junior: bookings, tasks, an overdue item |
| `priya@iima.ac.in` | Senior mentor: completed session with feedback |
| `ananya@iima.ac.in` | Senior moderator: moderation queue |
| `placements@iima.ac.in` | Institute staff: campus report |

---

## 5. Turn on the optional features

These need accounts with outside services. Add the keys to `.env.local`, then
restart `npm run dev`. The app runs without them; only the listed feature is off.

| Feature | Keys | Get them from |
| --- | --- | --- |
| AI interview, resume roast | `GOOGLE_GENERATIVE_AI_API_KEY` | https://aistudio.google.com/apikey |
| File uploads | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary dashboard |
| Realtime messages and rooms | `PUSHER_APP_ID`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` | Pusher Channels app → App Keys |
| Weekly digest email | `RESEND_API_KEY`, `CRON_SECRET` | Resend dashboard; `CRON_SECRET` is any long random string |

Core settings, already in `.env.local`:

| Key | Purpose |
| --- | --- |
| `MONGODB_URI` | Database. Local: `mongodb://127.0.0.1:27017/mba-antisocial` |
| `AUTH_SECRET` | Signs login sessions, 32+ characters. Changing it logs everyone out |
| `APP_URL` | Public address, `http://localhost:3000` locally |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated domains allowed to register; empty means anyone |

---

## 6. Final checklist

- [ ] `setup.ps1` ended with **Setup complete**
- [ ] `npm run verify` passes (included with `-Verify`)
- [ ] http://localhost:3000 loads
- [ ] You can log in with a seed account, and register a new one
- [ ] `docker ps` shows `mba-mongo` running
- [ ] `git remote -v` shows `https://github.com/19otherrsh-dot/MBAAntisocial.git`
- [ ] `git pull` works (the first time, a GitHub sign-in window opens)
- [ ] Optional features you need are configured (step 5)
- [ ] The transfer zip is deleted from the USB drive or wherever you sent it

---

## What moves and how

| Item | How it reaches the new computer |
| --- | --- |
| Source code, config, icons, seed script, `setup.ps1` | Zip or GitHub |
| `.env.local` (secrets) | **Zip only** |
| Git history and GitHub link | Zip (`.git` folder) or `git clone` |
| `node_modules/` | Rebuilt by `npm ci` |
| `.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts` | Rebuilt by `npm run dev` / `npm run build` |
| Database contents | Nothing to move; the old computer had no MongoDB data. `npm run seed` gives sample data |
| Vercel deployment and its environment variables | Stay on Vercel; nothing to move |

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "running scripts is disabled on this system" | Use the full command in step 3; `-ExecutionPolicy Bypass` applies to that run only |
| `git` not found in PowerShell | Reinstall Git for Windows and choose the "command line and 3rd-party software" option; reopen the terminal |
| "Docker is installed but not running" | Start Docker Desktop, wait until it says *Engine running*, re-run the script |
| Port 27017 already in use | Another MongoDB is running. Either use it (leave `MONGODB_URI` as is) or stop it |
| `Invalid environment configuration` on start | The message names the bad key; fix it in `.env.local` |
| `npm ci` fails | Check `node --version` is 20.9+; delete `node_modules` and re-run |
| Using MongoDB Atlas | Set `MONGODB_URI=mongodb+srv://...` and add your IP under Atlas → Network Access |
| Logged out after changing `AUTH_SECRET` | Expected; log in again |

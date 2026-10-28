# MBAAntisocial for iOS and Android

An Expo (SDK 58, expo-router) app on the same backend as the web app.

| Native screen | What it does |
| --- | --- |
| **Today** | Classes with one-tap attendance, what's due (tick it off), sessions and rounds, the briefing and quiz, events, games waiting on you |
| **Prep** | Open mock slots (cross-campus on the Open Edition), booking, your sessions with their meeting links |
| **Tasks** | Your list; tick things off, add one in a line |
| **Hub** | Servers, channels and DMs, live over the realtime socket; read-only channels say so |
| **More** | Everything else (games, resume studio, timetable, money, wellbeing, settings) opens signed in inside the app, without the web's navigation |

Other features:

- **Sign-in** uses a password, an emailed code, or institute SSO. It's limited to official emails, like the web.
- **Push notifications** go through Expo, and tapping one opens what it's about.

## Run it

```bash
cp .env.example .env      # point EXPO_PUBLIC_API_URL at your web app
npm install
npm start                 # then press i (iOS simulator), a (Android emulator), or w (web preview)
```

`EXPO_PUBLIC_API_URL` depends on where the app runs:

- `http://localhost:3000` for the iOS simulator;
- `http://10.0.2.2:3000` for the Android emulator;
- your computer's LAN IP for a phone on the same Wi-Fi.

The web preview (`npm run web`) calls the API from a browser, so add its origin to the web app's
`API_CORS_ORIGINS`, e.g. `http://localhost:8081`.

Expo Go covers most of it. Native modules (secure storage, notifications, WebView) are all
part of the Expo SDK; push needs a development build and an EAS project:

```bash
npx eas-cli@latest init          # creates the project and writes extra.eas.projectId
npx eas-cli@latest build --profile development --platform ios   # or android
```

`eas.json` defines `development`, `preview` and `production` profiles. Set each one's
`EXPO_PUBLIC_API_URL` to the matching deployment.

## How it fits the monorepo

- **Kept outside the npm workspaces**, with its own `package-lock.json`. Expo pins its own React and React Native, and hoisting them beside Next.js would destabilise the web app. Install here with `npm install`; use the versions in `expo/bundledNativeModules.json` when adding native modules (`npx expo install` does this when Expo's API is reachable).
- **Shares `@mba/shared`** through a `file:` link. `metro.config.js` watches `packages/shared` so Metro bundles its TypeScript source. The Today contract, session types and the realtime protocol come from there, so the web and the app can't drift.
- **Auth:** bearer tokens from `/api/mobile/auth/*`, stored in the Keychain or Keystore (`expo-secure-store`). The server re-checks role and suspension on every request; a revoked session is signed out on its next call.
- **Web screens:** `app/web.tsx` trades a one-time code (`/api/mobile/auth/web-code`) for a cookie session through `/mobile/web-login?embed=1`, which also tells the web shell to hide its navigation.

## Checks

```bash
npm run typecheck   # tsc
npm run lint        # expo lint
npm run bundle      # Metro export for iOS and Android: proves everything resolves
```

CI runs all three (`.github/workflows/ci.yml`, job `mobile`).

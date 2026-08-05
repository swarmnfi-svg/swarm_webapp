# Cloud agent handoff — SWARM Android (Capacitor)

**Status:** Production plan phases 0–4 implemented on branch `cursor/android-production-capacitor-b5fd`  
**App ID:** `com.nanofarm.swarm`  
**API:** `https://api.swarm.co.in/api`

## Done

| Phase | Item |
|-------|------|
| 0 | `VITE_API_URL` → `https://api.swarm.co.in/api` in `api.js`, `.env.production.example`, `ANDROID_APK.md`; local `.env.production` gitignored |
| 1 | Mobile SSO: `redirectToSso` on Login/Signup; `@capacitor/browser`; deep link; `appUrlOpen`; native gated in `sso.js` |
| 2 | `network_security_config.xml` + Manifest link for LAN cleartext (ESP) |
| 3 | Hardware back button via `@capacitor/app` in `App.jsx` |
| 4 | Cross-platform `android:apk` / `android:release` scripts + signing docs |

## Blocker

**emPOWER** must register `com.nanofarm.swarm://auth/callback` as an allowed OAuth `redirect_uri` for client `swarm_webapp`. Backend already sends this URI when `native=true` on `/auth/sso/login-url|signup-url` and `/auth/sso/callback`.

## Verify

```bash
cd frontend
cp .env.production.example .env.production   # if missing
npm install
npm run build:android
```

Do not commit `.env.production`, `*.jks`, `*.keystore`, or `keystore.properties`.

See [ANDROID_APK.md](./ANDROID_APK.md) for full build/signing steps.

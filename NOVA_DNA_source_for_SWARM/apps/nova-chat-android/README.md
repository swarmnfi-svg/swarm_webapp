# NOVA Chat — Native Android (Kotlin + Jetpack Compose)

**Canonical NOVA Chat app** — dedicated messaging product, **not** a WebView ERP shell.

| Flavor | Display name | applicationId | Production API |
|--------|--------------|---------------|----------------|
| `bpg` | NOVA Chat 1.2.18b | `com.empower.nova.bpg.android` | `https://erp.empowerbpg.com` |
| `saas` | NOVA Chat 1.2.18s | `com.empower.nova.saas.android` | `https://accounts.empowerapp.in` |

## Versioning (BPG + SaaS)

Single semver in [`version.properties`](./version.properties) — plane suffix in Gradle:

| Marketing | Example | `versionCode` |
|-----------|---------|---------------|
| `major.minor.patch` + **`b`** (BPG) | `1.2.3b` | `10203` |
| `major.minor.patch` + **`s`** (SaaS) | `1.2.3s` | `10203` (same integer) |

**Rule:** patch **0–99** on a minor line, then minor bumps (`1.2.99s` → `1.3.0s`).

```bash
node scripts/nova-chat-version.mjs show
node scripts/nova-chat-version.mjs apply 1.2.9
node scripts/nova-chat-version.mjs bump-patch
node --test scripts/nova-chat-version.test.mjs
```

## Architecture

- **UI:** Jetpack Compose — Login (+ MFA OTP, show/save password), Inbox, Chat, My reports, Settings
- **API:** Retrofit → `/api/client/v1/*` + Bearer `/api/nova/reports*` per [`API.md`](./API.md)
- **Auth:** Bearer + refresh authenticator (`POST …/auth/token`) in EncryptedSharedPreferences (Keystore-safe fallback)
- **API base URL:** release + default debug use production (`erp.empowerbpg.com` / `accounts.empowerapp.in`). Local emulator host only with `-PnovaDebugLocalApi=true` or `-PnovaApiBaseUrl=http://10.0.2.2:3000`

See `docs/plans/NOVA_CHAT_DEDICATED_ANDROID_PLAN.md` and Phase 2 roadmap.

## Phase 2 features (1.2.9 local)

| Area | How to test |
|------|-------------|
| Premium branding | BPG login shows NOVA + emPOWER + Biopower; SaaS has no Biopower / no “BPG” |
| Login UX | Show/hide password eye; Save password checkbox (secure prefs prefill) |
| Session stay signed-in | Background / overnight — refresh token kept; no logout on network blips |
| Channel feeds | Tasks / Approvals / Payments (RBAC) / Updates — chat-style rows, latest on top |
| Chat links | Ask something that returns ERP links → tap chip |
| Clarify options | Ambiguous entity ask → option chips → tap to continue |
| Save report | Pack answer → **Save report** → Settings → My reports |
| My reports | TXT / CSV / PDF share; Delete; Regenerate |
| Clear chat | Chat Clear or Settings → clears server DialogState |
| Token refresh | Stay signed in past ~1h (OkHttp authenticator) |
| MFA | MFA-enabled user → OTP screen after password |
| Voice | Tap or hold mic → dictate → review draft → Send; toolbar speaker for TTS |
| Provenance / Ask deeper | Chip on answers; Ask deeper on deterministic ERP replies |
| Push | Scaffold only — needs Firebase `google-services.json` (see `push/PushTokenProvider.kt`) |
| Deep links | `nova://chat?threadId=tasks` opens thread when logged in |

## Local dev testing (emulator + real API)

From repo root:

```bash
npx prisma migrate deploy   # includes ClientApiRefreshToken if not applied
npm run dev
```

Use a local emPOWER user (seed defaults: `admin@biopower.co.in` / password from `ADMIN_DEFAULT_PASSWORD` or `ChangeMe@123` if never changed). User needs `ai.assistant.read` and platform NOVA flag ON.

Then build and install **debug against local `npm run dev`** (opt-in local API):

```bash
cd apps/nova-chat-android
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew :app:assembleBpgDebug :app:assembleSaasDebug -PnovaDebugLocalApi=true
adb install -r app/build/outputs/apk/bpg/debug/app-bpg-debug.apk
# SaaS: adb install -r app/build/outputs/apk/saas/debug/app-saas-debug.apk
```

Default debug (no `-PnovaDebugLocalApi`) hits **production** — same hosts as release — so sideloaded `*-debug.apk` files still log in.

**Manual smoke checklist**

1. Login (BPG shows Biopower; SaaS does not) → Inbox shows NOVA + channels
2. Chat: ask tasks question → links chip, provenance; ambiguous ask → option chips
3. Pack answer → Save report → Settings → My reports → TXT/CSV/PDF share, Delete, Regenerate
4. Clear chat (toolbar or Settings) → dialog reset
5. Tap or hold mic → dictate → Send (grant RECORD_AUDIO); confirm Speak / auto TTS on replies
6. MFA user → OTP screen → Verify
7. Protected routes without token return 401 (curl below)

Smoke the API from host:

```bash
# Expect 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/client/v1/nova/threads
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/nova/reports

curl -s -X POST http://localhost:3000/api/client/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"client":"nova-android","platform":"android","appKind":"nova","email":"USER","password":"PASS"}'
```

## Build debug APKs

```bash
cd apps/nova-chat-android
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew :app:assembleBpgDebug :app:assembleSaasDebug
cp app/build/outputs/apk/bpg/debug/app-bpg-debug.apk ~/Downloads/NOVA-Chat-BPG-1.2.18b-debug.apk
cp app/build/outputs/apk/saas/debug/app-saas-debug.apk ~/Downloads/NOVA-Chat-1.2.18s-debug.apk
```

## Build release APKs (catalog / sideload)

Release builds are signed with the local Android debug keystore (same as emPOWER KEEP). **Do not publish `*-unsigned.apk`** — Android rejects unsigned packages.

```bash
cd apps/nova-chat-android
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew :app:assembleBpgRelease :app:assembleSaasRelease
# Verify before publish:
"$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | tail -1)/apksigner" verify --verbose \
  app/build/outputs/apk/bpg/release/app-bpg-release.apk
cp app/build/outputs/apk/bpg/release/app-bpg-release.apk ../../releases/apps/mobile/NOVA-Chat-BPG-1.2.18b.apk
cp app/build/outputs/apk/saas/release/app-saas-release.apk ../../releases/saas-apps/mobile/NOVA-Chat-1.2.18s.apk
```

## FCM (blocked without secrets)

Do **not** commit `google-services.json`. When available:

1. Place under `app/src/bpg/` and `app/src/saas/`
2. Enable Google Services Gradle plugin + Firebase Messaging
3. Replace `NoOpPushTokenProvider` and register token with devices API

## Deprecated

Do **not** extend `apps/empower-nova-bpg-android` or `apps/empower-nova-saas-android` (Capacitor WebView → ERP `/nova`).

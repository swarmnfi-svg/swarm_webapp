# SWARM Android APK (Capacitor)

The mobile app is the **same React web app** wrapped in a native Android WebView via [Capacitor](https://capacitorjs.com/). No UI/UX changes — phone and tablet use the existing responsive layouts.

---

## Prerequisites

1. **Node.js** 18+ (already used for frontend)
2. **Android Studio** (includes Android SDK + JDK)
   - Install: https://developer.android.com/studio
   - Open Android Studio once and complete SDK setup
3. **Environment** (optional if Android Studio sets them):
   - `ANDROID_HOME` or `ANDROID_SDK_ROOT` pointing to your SDK
   - Java 17+

---

## One-time setup

```powershell
cd C:\Users\seena\swarm_webapp\frontend
npm install
```

Capacitor is already configured in `capacitor.config.json`. The Android project lives in `frontend/android/`.

---

## Configure backend URL

The APK talks to your **deployed** API (not localhost).

Edit `frontend/.env.production`:

```env
VITE_API_URL=https://rare-passion-production-fc1a.up.railway.app/api
```

Use your production backend URL if different.

**Railway backend:** add `https://localhost` to `CORS_ORIGINS` (required for Capacitor WebView):

```env
CORS_ORIGINS=https://swarmwebapp-production.up.railway.app,https://localhost
```

Redeploy backend after updating CORS.

---

## Build debug APK (install on phone/tablet)

```powershell
cd C:\Users\seena\swarm_webapp\frontend
npm run android:apk
```

**Output APK:**

```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Copy to phone (USB, email, or cloud) and install. Enable “Install unknown apps” if prompted.

---

## Build release APK (Play Store / distribution)

1. Open Android Studio:

   ```powershell
   npm run cap:open:android
   ```

2. **Build → Generate Signed Bundle / APK**
3. Choose APK, create or use a keystore, select `release`
4. Output: `android/app/build/outputs/apk/release/app-release.apk`

---

## After web app changes

Whenever you change the React app:

```powershell
npm run build:android
```

Then rebuild APK (`npm run android:apk` or Android Studio).

---

## Phone vs tablet

- Same APK for phones and tablets
- Existing responsive CSS (`responsive.css`, MUI breakpoints) handles layout
- Plant HMI maximize and Connect Device stepper already support mobile

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login fails / network error | Check `VITE_API_URL` in `.env.production` and rebuild |
| CORS error in app | Add `https://localhost` to backend `CORS_ORIGINS` |
| `gradlew` not found | Run from `frontend/android` or use `npm run android:apk` |
| SDK not found | Install Android Studio; set `ANDROID_HOME` |
| White screen | Run `npm run build:android` then rebuild APK |

---

## Project files

| File | Purpose |
|------|---------|
| `capacitor.config.json` | App id, name, web bundle dir |
| `.env.production` | API URL baked into APK at build time |
| `android/` | Native Android project (Gradle) |
| `package.json` scripts | `build:android`, `android:apk` |

**App ID:** `com.nanofarm.swarm`  
**Display name:** SWARM

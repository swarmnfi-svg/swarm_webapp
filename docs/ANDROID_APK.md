# SWARM Android APK (Capacitor)

The mobile app is the **same React web app** wrapped in a native Android WebView via [Capacitor](https://capacitorjs.com/). No UI/UX changes — phone and tablet use the existing responsive layouts.

**App ID:** `com.nanofarm.swarm`  
**Display name:** SWARM  
**Production API:** `https://api.swarm.co.in/api`

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

The APK talks to the **production** API.

Copy the example env file (`.env.production` is gitignored — never commit it):

```powershell
copy .env.production.example .env.production
```

```env
VITE_API_URL=https://api.swarm.co.in/api
```

**Backend CORS** must include Capacitor WebView origins (already enforced in `SecurityConfig`):

```env
CORS_ORIGINS=https://app.swarm.co.in,https://localhost,capacitor://localhost
```

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

### Option A — CLI (cross-platform)

1. Create a keystore (one-time; **do not commit** `*.jks` / `*.keystore`):

   ```powershell
   keytool -genkey -v -keystore swarm-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias swarm
   ```

2. Create `frontend/android/keystore.properties` (gitignored):

   ```properties
   storeFile=../../swarm-release.jks
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=swarm
   keyPassword=YOUR_KEY_PASSWORD
   ```

3. Wire signing in `android/app/build.gradle` (when ready for Play Store) via `signingConfigs.release` reading `keystore.properties`, then:

   ```powershell
   npm run android:release
   ```

   **Output:** `frontend/android/app/build/outputs/apk/release/app-release.apk`  
   (Unsigned until `signingConfigs` are configured — then a signed release APK.)

### Option B — Android Studio

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

Then rebuild APK (`npm run android:apk`, `npm run android:release`, or Android Studio).

---

## Mobile SSO (emPOWER)

When `IDENTITY_MODE=saas`, Login/Signup auto-redirect to emPOWER.

| Platform | Behavior |
|----------|----------|
| Web | Full-page redirect to `accounts.empowerapp.in` → `/auth/callback` |
| Android | `@capacitor/browser` opens SaaS; return via deep link `com.nanofarm.swarm://auth/callback` |

**Blocker:** emPOWER must register `com.nanofarm.swarm://auth/callback` as an allowed OAuth `redirect_uri` for client `swarm_webapp`. Until then, native SSO authorize/token exchange will fail with invalid redirect.

---

## ESP / IoT cleartext (Connect Device)

`network_security_config.xml` permits cleartext HTTP to private LAN IPs so the WebView can reach ESP devices on `192.168.x.x` / `10.x` / `172.16–31.x` during pairing. Production API remains HTTPS.

---

## Phone vs tablet

- Same APK for phones and tablets
- Existing responsive CSS (`responsive.css`, MUI breakpoints) handles layout
- Plant HMI maximize and Connect Device stepper already support mobile
- Hardware back button: history back, or exit app at root

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login fails / network error | Check `VITE_API_URL` in `.env.production` and rebuild |
| CORS error in app | Ensure backend includes `https://localhost` and `capacitor://localhost` |
| Native SSO fails after login | Confirm emPOWER registered `com.nanofarm.swarm://auth/callback` |
| ESP pairing cleartext blocked | Confirm `network_security_config.xml` is linked in `AndroidManifest` |
| `gradlew` not found | Use `npm run android:apk` (picks `gradlew` / `gradlew.bat`) |
| SDK not found | Install Android Studio; set `ANDROID_HOME` |
| White screen | Run `npm run build:android` then rebuild APK |

---

## Project files

| File | Purpose |
|------|---------|
| `capacitor.config.json` | App id, name, web bundle dir |
| `.env.production` | API URL baked into APK (gitignored) |
| `.env.production.example` | Template for production API URL |
| `android/` | Native Android project (Gradle) |
| `android/.../network_security_config.xml` | LAN cleartext for ESP |
| `package.json` scripts | `build:android`, `android:apk`, `android:release` |

**npm scripts**

| Script | Purpose |
|--------|---------|
| `build:android` | Vite production build + `cap sync android` |
| `android:apk` | Debug APK (Windows/Linux/macOS) |
| `android:release` | Release APK assemble (cross-platform) |
| `cap:open:android` | Open project in Android Studio |

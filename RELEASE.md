# Release guide — Anba Bishoy Church (Android / Google Play)

App ID: `com.fadiramzy.anbabishoy` · App name: `أنبا بيشوي` · targetSdk 36 · minSdk 24

The project is fully configured for a Play-ready App Bundle (AAB). The only
steps that cannot be automated are creating your signing key and uploading in
Play Console — both are covered below.

> Never commit `android/keystore.properties`, `*.keystore`, or `*.jks` files
> to git. They are already listed in `.gitignore`. Back up the keystore + its
> passwords somewhere safe (losing them means you can never update the app).

## Prerequisites (one-time, on your machine)

- Node.js 22+ (`node --version`)
- JDK 21 (Gradle / Android Gradle Plugin 8.13 require JDK 17+)
- Android SDK with API 36 (`platforms;android-36`, `build-tools;36.0.0`)

## 1. Create the release keystore (one-time)

```bash
keytool -genkeypair -v \
  -keystore ~/anba-bishoy-release.keystore \
  -alias anbabishoy \
  -keyalg RSA -keysize 2048 -validity 10000
```

Remember the store password, key alias, and key password.

## 2. Point the project at your keystore (one-time, stays on your machine)

```bash
cp android/keystore.properties.SAMPLE android/keystore.properties
# then edit android/keystore.properties with your real values
```

`storeFile` may be absolute, or relative to `android/app`
(e.g. `../anba-bishoy-release.keystore`).

## 3. Build the signed AAB for Google Play

```bash
npm install
npm run build:aab
# → android/app/build/outputs/bundle/release/app-release.aab  (SIGNED)
```

Without `android/keystore.properties` the same command still compiles, but the
AAB is **unsigned** (good for CI verification only — Play rejects it).

Other useful commands:

```bash
npm test            # web regression harness (must stay green)
npm run sync        # rebuild www/ + cap sync android
npm run build:debug # installable debug APK for on-device testing
npm run build:apk   # signed release APK (for direct distribution/testing)
```

## 4. Sanity-check the AAB before uploading

```bash
# 4a. It must be signed with YOUR key:
jarsigner -verify -verbose -certs android/app/build/outputs/bundle/release/app-release.aab | head

# 4b. Confirm package id / version:
APP=$(find ~/.gradle "$ANDROID_HOME" -name "apkanalyzer" 2>/dev/null | head -n 1) # or use Android Studio's
# easiest: unzip -p app-release.aab BundleConfig.pb.json ... — or simply check
# that android/app/build.gradle has applicationId com.fadiramzy.anbabishoy,
# versionCode 1, versionName 1.0.0 (bump versionCode on every Play update).
```

Recommended: install the debug APK from step 3 on a real phone and walk
through the app once (open each tab, add/edit a record, export JSON + a PDF,
open a Maps link, use the hardware back button).

## 5. Upload to Google Play

1. Go to [Play Console](https://play.google.com/console) → create the app
   ("أنبا بيشوي", default language Arabic).
2. **Release → Production → Create new release** → upload `app-release.aab`.
   (First upload: Play enrolls the app in Play App Signing — recommended.)
3. Complete the required questionnaires:
   - **Data safety**: the app stores member/visitation data in on-device
     storage (IndexedDB) only; approximate/precise location is used solely
     for the optional in-app "record location" feature when the user taps
     it; the optional "share updated data" button POSTs a JSON backup to
     your own Telegram relay worker. No ads, no analytics SDKs.
   - **Content rating / target audience / news-app declarations** as prompted.
4. Roll out to production (or a closed-testing track first).

## How the Android packaging works (for maintainers)

- `npm run sync:web` (`scripts/sync-web.js`) rebuilds the **generated,
  git-ignored** `www/` folder from the repo-root website files, then applies
  Android-only transforms to that copy: injects `capacitor-bridge.js`,
  skips service-worker registration on native, strips the accidentally saved
  Cloudflare challenge scripts. The website itself is never modified.
- `capacitor-bridge.js` (loaded in the app only) adds: hash-history-aware
  hardware back button, and reroutes blob: downloads (JSON backups, jsPDF
  PDFs) through the Filesystem + Share plugins so the user can save/share
  files via the system sheet. No-op on the web.
- `npx cap sync android` copies `www/` into
  `android/app/src/main/assets/public` and wires the Capacitor plugins
  (App, Filesystem, Geolocation, Share).
- Release signing is configured in `android/app/build.gradle` and activates
  automatically when `android/keystore.properties` exists.

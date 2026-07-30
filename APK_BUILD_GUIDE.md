# SANKALP AI — Android APK Build Guide (EAS)

> **Goal:** Build a `.apk` file you can install directly on any Android phone,
> without going through the Play Store.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| Expo account | Free — create at https://expo.dev/signup |
| Expo account username | Must match `"owner": "sportifykartik"` in `app.json` |
| Node.js 18+ | Install from https://nodejs.org if not already installed |
| EAS CLI | Installed in Step 1 below |
| Android phone | To sideload the APK (enable "Install from unknown sources") |
| Replit app deployed | The APK needs a live HTTPS backend — deploy your Replit app first |

---

## Step 1 — Deploy the Backend (Critical!)

The APK is a native app — it cannot reach `localhost`. It needs a real HTTPS URL.

**Your backend URL is already configured in `eas.json`:**
```
https://sankalp-ai.replit.app
```

Make sure your Replit app is **published/deployed** (click the Deploy button in Replit).
The `eas.json` file already has this URL baked into all build profiles.

> ⚠️ If your deployed URL ever changes, update `"EXPO_PUBLIC_DOMAIN"` in `eas.json`
> for all profiles (`apk`, `preview`, `production`) before rebuilding.

---

## Step 2 — Install EAS CLI on your local machine

Open a terminal **on your computer** (not in Replit):

```bash
npm install -g eas-cli
```

Verify it installed:
```bash
eas --version
```

---

## Step 3 — Log in to your Expo account

```bash
eas login
```

Enter your Expo username (`sportifykartik`) and password when prompted.

---

## Step 4 — Clone / download the project

If you haven't already, download the project from Replit to your local machine
(use "Download as zip" from the Replit menu, or `git clone` if you have Git set up).

---

## Step 5 — Build the APK

In the project root on your local machine:

```bash
eas build --platform android --profile apk
```

This uploads your code to Expo's build servers and compiles a native APK.
The build usually takes **5–15 minutes**.

When it finishes, EAS prints a download URL like:
```
✅ Build finished
https://expo.dev/artifacts/eas/xxxx.apk
```

---

## Step 6 — Install on your phone

1. Download the `.apk` file from the URL above.
2. Transfer it to your Android phone (AirDrop, Google Drive, USB cable, etc.).
3. On the phone: **Settings → Security → Install from unknown sources** (enable it).
4. Open the `.apk` file from your file manager and tap Install.
5. Launch **SANKALP AI** — it will connect to `sankalp-ai.replit.app` automatically.

---

## Build Profiles

| Profile | Output | Use case |
|---------|--------|----------|
| `apk` | `.apk` sideloadable | Internal testing, direct install |
| `preview` | `.apk` sideloadable | Alias for `apk` |
| `production` | `.aab` (Play Store bundle) | Google Play submission |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `"owner" mismatch` | Make sure you're logged in as `sportifykartik` |
| API calls fail in APK | Check that `https://sankalp-ai.replit.app` is deployed and responding |
| Maps not loading | Already fixed — Leaflet is inlined, no CDN needed |
| Icons missing | Already fixed — font hash-stripping middleware is live on the server |
| Build fails on EAS | Check https://expo.dev/accounts/sportifykartik/projects/sankalp-ai/builds |

---

## Project IDs (for reference)

- **EAS Project ID:** `a882b97c-171c-4c3a-8499-5c3533c11516`
- **Expo owner:** `sportifykartik`
- **Android package:** `com.sankalpai`
- **Backend:** `https://sankalp-ai.replit.app`

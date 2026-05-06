# SANKALP AI — Android APK Build Guide (EAS)

> **Goal:** Build a `.apk` file you can install directly on any Android phone,
> without going through the Play Store.

---

## What You Need

| Requirement | Details |
|-------------|---------|
| Expo account | Free — create at https://expo.dev/signup |
| Expo account username | Must match `"owner": "uuyhb"` in `app.json` |
| Node.js 18+ | Already installed in this project |
| EAS CLI | Installed in the next step |
| Android phone | To install the APK (or use an emulator) |
| Backend deployed | The Replit app must be **published/deployed** |

---

## Step 1 — Deploy the Backend First (Critical!)

The APK is a native app — it can't reach `localhost`. It needs a real HTTPS URL.

**Your backend URL is already configured:**
```
https://animation-graphics-hub--monalweb61.replit.app
```

Make sure your Replit app is **published/deployed** (click the Deploy button in Replit).
The `eas.json` file already has this URL baked in for all build profiles.

> If your deployed URL changes, update `"EXPO_PUBLIC_DOMAIN"` in `eas.json` for all
> three profiles (`apk`, `preview`, `production`) before building.

---

## Step 2 — Install EAS CLI

Run this **on your local machine** (or in the Replit Shell):

```bash
npm install -g eas-cli
```

Verify it works:
```bash
eas --version
# Should print: eas-cli/x.x.x
```

---

## Step 3 — Log In to Expo

```bash
eas login
```

Enter your Expo account credentials (the same account that owns `uuyhb`).

Verify you're logged in as the right user:
```bash
eas whoami
# Should print: uuyhb
```

> ⚠️ **Important:** The `app.json` sets `"owner": "uuyhb"`. You must log in as
> that exact Expo account or the build will fail with a permissions error.

---

## Step 4 — Build the APK

From the project root directory, run:

```bash
eas build --platform android --profile apk
```

What happens:
1. EAS uploads your source code to Expo's cloud build servers
2. It compiles a native Android APK (this takes **5–15 minutes**)
3. When done, it prints a download link

**Watch the build progress at:**
```
https://expo.dev/accounts/uuyhb/projects/sankalp-ai/builds
```

---

## Step 5 — Download the APK

When the build finishes:

**Option A — From the terminal:**
The CLI prints a direct `.apk` download URL. Click it or paste in browser.

**Option B — From expo.dev:**
1. Go to https://expo.dev
2. Sign in → Projects → `sankalp-ai`
3. Click "Builds" in the left sidebar
4. Find your build → click **"Download"**

---

## Step 6 — Install on Android

### Method 1 — Direct on phone
1. Send the `.apk` file to your phone (WhatsApp, email, Google Drive, USB)
2. Open the file on the phone
3. If prompted: **Settings → Allow from this source**
4. Tap Install

### Method 2 — ADB (USB cable)
```bash
# Make sure USB Debugging is enabled on the phone
adb install sankalp-ai.apk
```

### Method 3 — QR code on expo.dev
On the build detail page, expo.dev shows a QR code — scan it with your phone's camera to download directly.

---

## One-Command Summary

```bash
# 1. Install EAS CLI (once)
npm install -g eas-cli

# 2. Login (once)
eas login

# 3. Build APK
eas build --platform android --profile apk

# 4. Download from the printed URL and install
```

---

## Build Profiles Explained

| Profile | Command | Output | Use For |
|---------|---------|--------|---------|
| `apk` | `--profile apk` | `.apk` file | Direct install, demos, testing |
| `preview` | `--profile preview` | `.aab` via Expo | Internal testers via expo.dev |
| `production` | `--profile production` | `.aab` for Play Store | App Store submission |

---

## If Building from Replit Shell

The Replit shell can run EAS builds, but the build itself runs in Expo's cloud —
your machine just monitors progress. Run:

```bash
npx eas-cli build --platform android --profile apk --non-interactive
```

The `--non-interactive` flag prevents it from waiting for input.

---

## Environment Variables in the Build

The APK needs `EXPO_PUBLIC_DOMAIN` to know which server to talk to.
This is already set in `eas.json`:

```json
"apk": {
  "env": {
    "EXPO_PUBLIC_DOMAIN": "animation-graphics-hub--monalweb61.replit.app"
  }
}
```

If you ever change your backend URL (e.g., custom domain), update this value
in `eas.json` and rebuild the APK.

For the NVIDIA API key, add it as an EAS secret (never in source code):
```bash
eas secret:create --name NVIDIA_API_KEY --value "nvapi-your-key-here"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Error: Not authorized` | Run `eas login` and ensure you're logged in as `uuyhb` |
| `Project not found` | Check `"owner"` and `"slug"` in `app.json` match your Expo account |
| App opens but "Network request failed" | Backend not deployed — publish the Replit app first |
| App installs but blank screen | Check `EXPO_PUBLIC_DOMAIN` in eas.json matches your deployed URL |
| Build fails: "metro bundler error" | Run `npx expo install --fix` then retry |
| "Unknown build profile" | Make sure you type `--profile apk` exactly |
| Can't install APK | Enable "Install unknown apps" in Android Settings → Security |
| Build queue is long | Free Expo accounts share build workers — wait 10–20 min during peak hours |

---

## Checking Your Deployed Backend URL

Your backend URL is set in two places:

1. **`app.json`** → `extra.EXPO_PUBLIC_DOMAIN`
2. **`eas.json`** → `build.apk.env.EXPO_PUBLIC_DOMAIN`

Both should point to the same Replit deployment URL. To find your current URL:
- In Replit: click **"Deploy"** tab → copy the `.replit.app` domain shown there

---

## App Details

| Field | Value |
|-------|-------|
| App Name | SANKALP AI |
| Package ID | `com.sankalpai` |
| EAS Project ID | `09c3550a-dabb-4f1c-8a7a-b69733e059ce` |
| Expo Owner | `uuyhb` |
| Expo Slug | `sankalp-ai` |
| Min Android | Android 5.0+ (API 21) |
| Architecture | New Architecture enabled |

---

## After the APK is Built — Demo Flow

Once installed, log in with:
- **Super Admin:** `9999999999` / `000000`
- **Admin (Dehradun):** `9999000001` / `111111`
- **Citizen:** `9876543210` / `123456`

The APK connects to your deployed Replit backend for all data, AI chat,
WebSocket real-time updates, SOS alerts, and maps.

---

*SANKALP AI — Uttarakhand Civic Governance Platform*

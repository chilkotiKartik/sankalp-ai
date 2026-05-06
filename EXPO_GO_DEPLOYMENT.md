# SANKALP AI — Expo Go Deployment Guide

## What is Expo Go?

Expo Go is a free app (iOS & Android) that lets you run this app instantly on a real device by scanning a QR code — no App Store submission or build required. Best for demos, testing, and stakeholder previews.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| pnpm / npm | any | bundled with Node |
| Expo Go (phone) | Latest | [iOS](https://apps.apple.com/app/expo-go/id982107779) · [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) |

---

## Step 1 — Clone & Install

```bash
git clone <your-repo-url>
cd <project-folder>
npm install
```

---

## Step 2 — Set Environment Variables

Create a `.env` file in the project root:

```env
NVIDIA_API_KEY=nvapi-your-key-here
```

The NVIDIA key powers the LLaMA 3.1 AI chatbot. The app falls back to local rule-based responses if the key is missing.

---

## Step 3 — Start the Backend Server

The Express backend must be running before the mobile app connects.

```bash
# Terminal 1 — Backend API (port 5000)
npx tsx server/index.ts
```

Verify it prints:
```
[NVIDIA] API key: loaded (XX chars)
express server serving on port 5000
```

---

## Step 4 — Start the Expo Dev Server

```bash
# Terminal 2 — Expo dev server (port 8080)
EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN \
REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_DEV_DOMAIN \
EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN \
npx expo start --localhost --port 8080
```

On **Replit**, both terminals are already configured as workflows — just click **Run**.

---

## Step 5 — Scan QR Code

1. Open **Expo Go** on your phone
2. Tap **"Scan QR Code"**
3. Scan the QR printed in Terminal 2
4. The app loads on your device

> **Note:** Your phone and computer must be on the same Wi-Fi network (or you must use the tunnel URL shown by Expo).

---

## Step 6 — Demo Accounts

| Role | Phone | PIN | District | Access |
|------|-------|-----|----------|--------|
| Super Admin | `9999999999` | `000000` | All Uttarakhand | All 13 districts, full war room |
| Dehradun Admin | `9999000001` | `111111` | Dehradun | District admin, complaints, workers |
| Haridwar Admin | `9999000002` | `222222` | Haridwar | District admin |
| Champawat Admin | `9999000003` | `333333` | Champawat | District admin |
| Citizen (Champawat) | `9876543210` | `123456` | Champawat | Citizen dashboard |
| Citizen (Dehradun) | `9811234567` | `112233` | Dehradun | Ramesh Kumar Rawat |
| Citizen (Haridwar) | `9711234568` | `223344` | Haridwar | Priya Bisht |
| Register new | tap Register | custom | any | Self-register as citizen |

---

## Step 7 — Key Features to Demo

### Citizen Flow
1. **Login** → tap Sign In, enter phone + PIN
2. **Dashboard** → live KPIs, ward health scores, announcements
3. **File Complaint** → tap "+" → choose category, describe, add photo (camera/gallery), submit
4. **District Map** → see all complaints, SOS alerts, police stations, risk zones on map
5. **AI Chat** → tap AI tab, ask "What is the water issue resolution time in Dehradun?"
6. **SOS Panic** → hold the SOS button 3 seconds → nearest police notified
7. **Leaderboard** → see civic points ranking

### Admin Flow
1. Login as Super Admin (`9999999999/000000`)
2. **War Room** → all 13 districts health grid (A–F grades)
3. **Live KPIs** → total complaints, SOS active, resolution rate
4. **Assign Complaint** → tap any complaint → assign to worker
5. **Emergency Broadcast** → admin index → "Emergency Broadcast" button
6. **Worker Map** → admin → Worker Map → colored dots for active/idle/on-leave workers
7. **Departments** → admin → Departments → Hindi department names + complaints

---

## Production Build (EAS)

To publish to the App Store / Play Store:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure (one-time)
eas build:configure

# Build for Android (APK for testing)
eas build --platform android --profile preview

# Build for iOS (TestFlight)
eas build --platform ios --profile preview

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

EAS Project ID is already set in `app.json`:
```json
"eas": {
  "projectId": "09c3550a-dabb-4f1c-8a7a-b69733e059ce"
}
```

---

## Web Preview (No Phone Needed)

The app also runs as a web app. Visit the Replit preview URL or:

```bash
# Serve the pre-built web bundle
npx tsx server/index.ts
# Open http://localhost:5000
```

The web version uses the SVG district map (Uttarakhand outline) since native MapView requires a real device.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Network request failed" | Make sure backend is running on port 5000 |
| QR not loading | Ensure phone & computer on same Wi-Fi; try tunnel mode: `expo start --tunnel` |
| Map not showing | On web: SVG map is expected. On device: ensure location permission granted |
| AI chat slow | NVIDIA API has ~5-10s latency; local fallback is instant |
| Login fails | Use exact demo PINs (6 digits). New registrations use bcrypt |
| WebSocket disconnects | Token expires after 7 days; just log out and back in |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│                  SANKALP AI                          │
├──────────────────┬──────────────────────────────────┤
│   Mobile/Web     │         Backend                  │
│  (Expo Router)   │    (Express + TypeScript)        │
│                  │                                  │
│  • React Native  │  • REST API (port 5000)          │
│  • Expo Go ready │  • WebSocket (/ws)               │
│  • Web export    │  • NVIDIA LLaMA AI               │
│  • Dark theme    │  • In-memory storage             │
│  • 20+ screens   │  • Rate limiting (bcrypt)        │
│  • Offline-aware │  • JWT auth + WS auth            │
└──────────────────┴──────────────────────────────────┘

Districts: 13 Uttarakhand districts
Languages: English + Hindi (bilingual)
Roles: Citizen · Worker · Admin · Super Admin
```

---

*Built for Uttarakhand civic governance — SANKALP AI v1.0*

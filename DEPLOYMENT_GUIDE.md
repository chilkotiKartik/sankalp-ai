# SANKALP AI — Deployment Guide

## Overview

SANKALP AI runs as a single Express server (`server/index.ts`) that:
- Serves the Expo web bundle (built SPA) at `/`
- Hosts 5 web portals at `/web/{portal,dept,cpr,public,rti}`
- Exposes REST API at `/api/*`
- Runs a WebSocket server for real-time mobile updates
- Streams SSE for department (`/api/dept/stream`) and CPR (`/api/cpr/stream`) portals

---

## Local Development

### 1. Install dependencies
```bash
npm install
```

### 2. Set environment variables
Create or export (see Environment Variables section below):
```bash
export GROQ_API_KEY=your_key
export NVIDIA_API_KEY=your_key   # optional, for AI chat
export OPENAI_API_KEY=your_key   # optional fallback
```

### 3. Start the backend server
```bash
node_modules/.bin/tsx server/index.ts
```
Server runs on **port 5000** by default.

### 4. Start Expo dev server (for native mobile / Expo Go)
```bash
EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN \
REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_DEV_DOMAIN \
EXPO_PUBLIC_DOMAIN=sankalp-ai.replit.app \
node_modules/.bin/expo start --localhost --port 8080
```

---

## Web Bundle Rebuild

After making changes to the React Native frontend, rebuild the static web bundle:

```bash
EXPO_PUBLIC_DOMAIN=sankalp-ai.replit.app \
EXPO_NO_TELEMETRY=1 \
EXPO_NO_DOTENV=1 \
node_modules/.bin/expo export --platform web --output-dir /tmp/web-build && \
rm -rf static-build/web && mv /tmp/web-build static-build/web
```

Then restart the backend server workflow.

---

## Replit Deployment (Publish)

1. Click **Deploy** / **Publish** in the Replit UI.
2. The server starts automatically via `node_modules/.bin/tsx server/index.ts`.
3. The app is available at `https://sankalp-ai.replit.app`.

### Production Environment Variables (required)
Set these as **Replit Secrets** (not in `.env` files):

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Groq LLaMA API — primary AI (RTI drafts, AI chat) | Yes |
| `NVIDIA_API_KEY` | NVIDIA AI — secondary (AI chat, vision) | Optional |
| `OPENAI_API_KEY` | OpenAI — tertiary fallback | Optional |
| `EXPO_PUBLIC_DOMAIN` | Set to `sankalp-ai.replit.app` for production builds | Build only |
| `JWT_SECRET` | JWT signing secret (auto-generated if not set) | Recommended |

To set secrets: Replit → Secrets (lock icon) → Add each key/value.

---

## Access URLs

| Portal | URL |
|--------|-----|
| Mobile App (web) | `https://sankalp-ai.replit.app/` |
| Unified Governance Portal | `https://sankalp-ai.replit.app/web/portal` |
| Department Portal | `https://sankalp-ai.replit.app/web/dept` |
| CPR Safety Command | `https://sankalp-ai.replit.app/web/cpr` |
| Public Civic Dashboard | `https://sankalp-ai.replit.app/web/public` |
| RTI Filing Portal | `https://sankalp-ai.replit.app/web/rti` |

---

## Demo Credentials

### Mobile App
| Role | Phone | PIN |
|------|-------|-----|
| Citizen | `9876543210` | `123456` |
| Super Admin | `9999999999` | `000000` |

### Department Portal (`/web/dept`)
Access code format: `{deptId}_2026`

| Department | Access Code |
|------------|-------------|
| Public Works | `pwd_2026` |
| Police | `police_2026` |
| Jal Sansthan | `jal_2026` |
| Electricity | `electricity_2026` |
| Health | `health_2026` |
| Forest | `forest_2026` |
| Municipal | `municipal_2026` |
| Revenue | `revenue_2026` |

### Unified Portal (`/web/portal`)
| Role | Phone | PIN |
|------|-------|-----|
| Citizen | `9876543210` | `123456` |
| Super Admin | `9999999999` | `000000` |
| Department | Use dept access codes above | — |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SANKALP AI Backend                        │
│                   Express + TypeScript                       │
│                     port 5000                               │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  REST API    │  │  WebSocket   │  │   SSE Streams    │  │
│  │  /api/*      │  │  /ws         │  │ /api/dept/stream │  │
│  │              │  │              │  │ /api/cpr/stream  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────┐  ┌──────────────────────────────────┐    │
│  │  Web Portals │  │     Static SPA (Expo Web)        │    │
│  │  /web/*      │  │     static-build/web/            │    │
│  └──────────────┘  └──────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Key Systems
- **Auth**: HMAC JWT tokens (25h TTL), bcrypt PIN hashing
- **Storage**: In-memory (Map + Arrays) — all data resets on server restart
- **AI Chain**: Groq (primary) → NVIDIA (secondary) → rule-based (fallback)
- **CPR**: 12 seeded patrol vans, auto-dispatch nearest on SOS
- **Proof of Work**: Dept assigns worker with temp PIN → worker submits photo proof → complaint auto-resolves

---

## Proof of Work System

**Flow:**
1. Dept staff opens a complaint → clicks "Assign Worker" → enters worker name + phone
2. System generates a 6-digit PIN (valid 48h)
3. Worker opens the mobile app → navigates to **Worker Portal** → logs in with phone + PIN + complaint ID
4. Worker submits photo proof + notes → complaint automatically resolves
5. Citizen sees "Resolved" status + proof photo in their complaint history

**API endpoints:**
- `PUT /api/dept/complaints/:id/assign-worker` — assigns worker, returns PIN
- `POST /api/auth/worker-login` — worker authenticates with phone + PIN + complaintId
- `PUT /api/complaints/:id/proof` — worker submits proof (phone + pin required)

---

## SOS System

### Categories
`gas_leak`, `water_burst`, `electric_hazard`, `fire_risk`, `road_accident`, `women_safety`, `medical`, `infrastructure`, `disaster`, `forest_fire`

### Women Safety Flow
1. Citizen activates panic (shake×4 / tap×6 / hold 2s / Vol+×5)
2. SOS alert sent immediately → police dept + CPR command notified
3. 18-second audio recording starts in background
4. After 18s: audio auto-uploaded → URL patched to SOS alert
5. Police portal shows "Audio evidence available" with download link

### CPR Integration
- Citizen can request CPR patrol from SOS screen → nearest van dispatched
- CPR Command portal (`/web/cpr`) shows live map + all active SOS alerts
- `PUT /api/sos/:id/location` — live GPS updates stream to CPR in real time

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Login says "Failed to fetch" | Ensure `EXPO_PUBLIC_DOMAIN=sankalp-ai.replit.app` is set; check server is running on port 5000 |
| Admin/worker pages broken | Token key must be `@sankalp_token` in AsyncStorage |
| Web portals blank | Server must be started; portals served at `/web/*` routes |
| AI chat not working | Set `NVIDIA_API_KEY` secret; Groq fallback works without it |
| Audio upload failing | Check `uploads/` directory is writable; expo-file-system must be installed |
| CPR stream disconnecting | SSE auto-reconnects every 3s; 200-listener limit on EventEmitters |
| Dept portal 401 | Access codes format: `{deptId}_2026`; tokens expire after server restart |
| Web bundle stale | Rebuild with `expo export` command; committed bundle in `static-build/web/` |

---

## Post-Deploy Checklist

- [ ] Verify `https://sankalp-ai.replit.app` loads the mobile app
- [ ] Login with citizen: `9876543210` / `123456`
- [ ] Submit a test complaint with photo
- [ ] Trigger SOS → verify police dept portal receives alert
- [ ] Open `/web/dept` → login with `pwd_2026` → verify live SSE feed
- [ ] Open `/web/cpr` → verify Leaflet map loads with 12 patrol vans
- [ ] Open `/web/portal` → login as super admin → verify war room
- [ ] Open `/web/rti` → verify AI draft generation (requires GROQ_API_KEY)
- [ ] Test women safety panic → verify audio recording indicator appears

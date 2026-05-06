# SANKALP AI — Deployment Guide

## Quick Reference

| Environment | URL | Port |
|-------------|-----|------|
| Development | `https://<repl>.replit.dev` | 5000 |
| Production | `https://sankalp-ai.replit.app` | 80 |

---

## Architecture Overview

```
Browser / Mobile App
        │
        ▼
  Express Server (port 5000)
  ├── /api/*          → REST API + WebSocket
  ├── /web/dept       → Department Portal (HTML)
  ├── /web/cpr        → CPR Safety Command (HTML)
  ├── /web/public     → Public Dashboard (HTML)
  ├── /web/rti        → RTI Filing Portal (HTML)
  ├── /web/portal     → Unified Governance Portal (HTML)
  ├── /uploads/*      → Uploaded files (photos, audio)
  └── /*              → Expo SPA (static-build/web/)
```

---

## Environment Variables (Required)

Set these in Replit → Secrets (already configured as shared secrets):

| Variable | Purpose | Required |
|----------|---------|----------|
| `EXPO_PUBLIC_DOMAIN` | Production domain for Expo web bundle | **Yes** |
| `GROQ_API_KEY` | Primary AI (LLaMA 3.1 8B, fastest) | **Yes** |
| `NVIDIA_API_KEY` | Secondary AI + RTI draft generation | Recommended |
| `OPENAI_API_KEY` | Tertiary AI fallback | Optional |

> All three AI keys fall back gracefully. Only `EXPO_PUBLIC_DOMAIN` and at least one AI key are required for full functionality.

---

## Deploying to Production (Replit)

### Method 1: One-Click Deploy (Recommended)

1. Open your Repl on [replit.com](https://replit.com)
2. Click the **Deploy** button (rocket icon, top right)
3. Choose **Autoscale** or **Reserved VM** deployment
4. Replit automatically:
   - Runs `node scripts/build.js` (builds the Expo web bundle + native manifests)
   - Starts `node_modules/.bin/tsx server/index.ts`
   - Sets `PORT` environment variable; server listens on `process.env.PORT || 5000`
5. App goes live at `https://sankalp-ai.replit.app`

### Method 2: Manual Deploy via CLI

```bash
# 1. Build the web bundle locally first
EXPO_PUBLIC_DOMAIN=sankalp-ai.replit.app \
EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 \
  node_modules/.bin/expo export --platform web --output-dir /tmp/web-build && \
  rm -rf static-build/web && mv /tmp/web-build static-build/web

# 2. Start the server
node_modules/.bin/tsx server/index.ts
```

---

## Build Process (What `scripts/build.js` Does)

The build script runs automatically on every Replit deployment:

1. **Reads deployment domain** — from `EXPO_PUBLIC_DOMAIN` → `REPLIT_INTERNAL_APP_DOMAIN` → `REPLIT_DEV_DOMAIN`
2. **Starts Metro bundler** on port 8081 to generate iOS/Android bundles
3. **Downloads native bundles** for iOS and Android (parallel)
4. **Downloads manifests** — required for Expo Go deep-link installs
5. **Extracts & downloads assets** — icons, fonts, images
6. **Updates bundle URLs** — rewrites Metro localhost URLs to production domain
7. **Updates manifests** — patches `hostUri`, `launchAsset.url`, removes dev flags
8. **Stops Metro** — frees port 8081 for web build
9. **Runs `expo export`** — generates the React Native Web bundle into `static-build/web/`

**Build timeout**: 5 minutes per step. If Metro fails, existing `static-build/web/` is preserved as fallback.

---

## Web Portals

All portals are plain HTML + React 18 CDN (no build step). They are served directly by Express:

| Portal | Route | Auth | Purpose |
|--------|-------|------|---------|
| Unified Governance | `/web/portal` | JWT (citizen/dept/admin) | Citizens, dept staff, admin war room |
| Department Portal | `/web/dept` | Dept JWT (`{id}_2026`) | Live complaints, SOS, announcements |
| CPR Safety Command | `/web/cpr` | None | Patrol vans, incidents, night safety |
| Public Dashboard | `/web/public` | None | Live stats, dept grades |
| RTI Portal | `/web/rti` | Auto-login as admin | File RTI applications |

### Portal Changes (No Rebuild Needed)

Editing any file in `server/web/` takes effect immediately on next page load — no `expo export` required.

### Expo App Changes (Rebuild Required)

After editing any file in `app/`, `context/`, or `components/`:

```bash
EXPO_PUBLIC_DOMAIN=sankalp-ai.replit.app EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 \
  node_modules/.bin/expo export --platform web --output-dir /tmp/web-build && \
  rm -rf static-build/web && mv /tmp/web-build static-build/web
```

Then restart the **Start application** workflow.

---

## Demo Credentials

| Role | Phone | PIN/Code |
|------|-------|----------|
| Citizen | `9876543210` | `123456` |
| Super Admin | `9999999999` | `000000` |
| PWD Dept | — | `pwd_2026` |
| ULB Dept | — | `ulb_2026` |
| Jal Sansthan | — | `jal_2026` |
| UPCL | — | `upcl_2026` |
| Forest | — | `forest_2026` |
| Health | — | `health_2026` |
| USDMA | — | `usdma_2026` |
| Police | — | `police_2026` |

---

## Troubleshooting

### App not loading in browser
1. Check **Start application** workflow is running (port 5000)
2. Check `static-build/web/index.html` exists — if not, run the `expo export` command above
3. Hard refresh: `Ctrl+Shift+R` (clears browser cache)

### AI chat not responding
1. Verify `GROQ_API_KEY` is set in Replit Secrets
2. Check server logs for `[GROQ] API key: loaded` message
3. Fallback chain: Groq → NVIDIA → local rule-based engine (always responds)

### SOS / WebSocket not connecting
- WebSockets connect to the same host/port as the page — no separate config needed
- In production, Replit's proxy handles WS upgrade automatically

### Deployed app returns 404 on page refresh
- Express SPA fallback is active: all non-API, non-portal, non-static routes serve `index.html`
- If seeing 404s, check `server/index.ts` SPA fallback route is last

### Portal SSE stream drops
- SSE uses heartbeat pings every 25 seconds to keep connections alive
- Replit's proxy has a ~60s idle timeout — heartbeats prevent this
- If SSE drops, the portal automatically reconnects (browser behavior)

### Department token expired (401 in portal)
- Dept tokens expire after 12 hours
- Portal stores token in `sessionStorage` — closing the tab clears it
- RTI portal auto-detects 401 and re-authenticates as super admin

### In-memory data lost after server restart
- All data is in-memory (no persistent DB) — this is by design for the demo
- Seed data (18 patrol vans, workers, sample complaints, announcements) is re-seeded on every restart
- For persistence, integrate Replit Database (PostgreSQL) via the integrations panel

---

## Health Check Endpoints

```
GET /api/departments       → List all 8 departments (public)
GET /api/public/stats      → Live civic stats (public)
GET /api/cpr/patrols       → All 18 patrol vans (public)
GET /api/cpr/emergency-services → Emergency contacts (public)
```

---

## Port Configuration

```
Production server: process.env.PORT || 5000
Expo DevServer:    8080 (development only)
Metro bundler:     8081 (build time only)

.replit port mapping:
  5000 → externalPort 80  (main app)
  8080 → externalPort 8080 (expo dev)
```

---

## Security Notes

- All admin endpoints require a valid JWT (`Authorization: Bearer <token>`)
- Department endpoints use HMAC-SHA256 signed tokens (12h TTL)
- Worker endpoints use 6-digit PIN (48h TTL, complaint-scoped)
- AI chat (`/api/ai/chat`) uses `optionalAuth` — works with or without token
- CPR portal and public dashboard have no auth — intentionally public
- SOS audio and complaint photos are stored in `/uploads/` with random filenames
- No sensitive data in logs (tokens are never logged)

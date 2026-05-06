# SANKALP AI — Railway Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────┐
│         Railway Service             │
│                                     │
│  Express.js Backend (server/)       │
│  ├── REST API  (/api/*)             │
│  ├── WebSocket (SOS real-time)      │
│  ├── SSE Streams (dept + CPR)       │
│  ├── Web Portals (/web/*)           │
│  └── Expo Web App (static-build/)   │
│                                     │
│  Public URL: your-app.up.railway.app│
└─────────────────────────────────────┘
         │                  │
    Expo Go App          Web Browser
  (iOS / Android)    your-app.up.railway.app
  scans QR code
```

**Everything runs in ONE Railway service.** The Express server:
- Serves the API + WebSocket + SSE
- Serves the Expo web bundle (React Native web app)
- Serves all 5 HTML web portals
- Provides native app manifests for Expo Go

---

## Step 1 — Push to GitHub

Your code must be on GitHub for Railway to deploy it.

```bash
# If you have uncommitted changes, commit first:
git add -A
git commit -m "Railway deployment setup"

# Fix push rejection (remote has new commits):
git pull --rebase origin main
git push origin main
```

If you get conflicts during rebase:
```bash
git rebase --abort          # undo the rebase
git merge origin/main       # try merge instead
git push origin main
```

---

## Step 2 — Create Railway Project

1. Go to [railway.app](https://railway.app) → **Login with GitHub**
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repo: `24f2004962/fiinalszip`
4. Railway will auto-detect the `railway.json` config

---

## Step 3 — Set Environment Variables

In Railway dashboard → your service → **Variables** tab, add:

| Variable | Value | Required |
|----------|-------|----------|
| `EXPO_PUBLIC_DOMAIN` | `your-app.up.railway.app` | **YES** |
| `GROQ_API_KEY` | your Groq key | **YES** (AI chat) |
| `NVIDIA_API_KEY` | your NVIDIA key | Recommended |
| `OPENAI_API_KEY` | your OpenAI key | Optional fallback |
| `NODE_ENV` | `production` | **YES** |
| `PORT` | *(Railway sets this automatically)* | Auto |

> **Important:** Set `EXPO_PUBLIC_DOMAIN` BEFORE triggering the first deploy.
> This domain gets baked into the Expo bundle at build time.

### How to get your Railway domain first:

1. Deploy once (it will fail/incomplete — that's okay)
2. Go to **Settings** → **Networking** → **Generate Domain**
3. Copy the domain (e.g. `sankalp-ai.up.railway.app`)
4. Add it as `EXPO_PUBLIC_DOMAIN`
5. **Redeploy** — Railway will rebuild with the correct domain

---

## Step 4 — Build & Deploy

Railway will automatically:
1. Run `npm install`
2. Run `node scripts/build.js` — this:
   - Starts Metro bundler
   - Builds iOS + Android Expo manifests
   - Builds the Expo web bundle
   - Shuts down Metro
3. Start `tsx server/index.ts`

Build takes ~5–8 minutes on first deploy. Subsequent deploys are faster.

### Build Logs to Watch For

```
Building static Expo Go deployment...
Metro ready
Fetching ios bundle...         ← iOS manifest being built
Fetching android bundle...     ← Android manifest being built
Downloaded N assets
Web bundle ready at static-build/web/
Build complete! Deploy to: https://your-app.up.railway.app
```

---

## Step 5 — Connect Expo Go (Mobile App)

After deploy, navigate to:
```
https://your-app.up.railway.app
```

You'll see the landing page with a **QR code**. Scan it with the **Expo Go** app on your phone.

### Expo Go Setup:
1. Download **Expo Go** from App Store / Google Play
2. Open Expo Go → tap **Scan QR Code**
3. Scan the QR from `https://your-app.up.railway.app`
4. App loads with full native features (maps, SOS, GPS, shake detection)

### Demo Login Credentials:
| Role | Phone | PIN |
|------|-------|-----|
| Citizen | `9876543210` | `123456` |
| Super Admin | `9999999999` | `000000` |
| District Admin | `9876543211` | `123456` |

---

## Step 6 — Access Web Portals

All web portals are available at your Railway domain:

| Portal | URL |
|--------|-----|
| Main Web App | `https://your-app.up.railway.app` |
| Unified Governance | `https://your-app.up.railway.app/web/portal` |
| Department Portal | `https://your-app.up.railway.app/web/dept` |
| CPR Safety Command | `https://your-app.up.railway.app/web/cpr` |
| Public Dashboard | `https://your-app.up.railway.app/web/public` |
| RTI Filing Portal | `https://your-app.up.railway.app/web/rti` |

### Department Portal Access Codes:
```
police_2026    upcl_2026    jal_2026    ulb_2026
pwd_2026       forest_2026  dm_2026     usdma_2026
```

---

## Step 7 — Custom Domain (Optional)

1. Railway **Settings** → **Networking** → **Custom Domain**
2. Add your domain (e.g. `sankalp.yourgov.in`)
3. Point DNS: `CNAME your-app.up.railway.app`
4. Update `EXPO_PUBLIC_DOMAIN` to your custom domain
5. Redeploy so the Expo bundle picks up the new domain

---

## Updating the App

### Backend-only changes (routes, portals, storage):
```bash
git add -A && git commit -m "fix: update routes"
git push origin main
# Railway auto-redeploys — no rebuild of Expo bundle needed
```

### Frontend changes (app/ directory, components, screens):
```bash
git add -A && git commit -m "feat: update UI"
git push origin main
# Railway will rebuild the full Expo bundle (~5-8 min)
```

### Web portal changes (server/web/*.html):
```bash
git push origin main
# HTML files served directly — just redeploy Express, no rebuild
```

---

## Railway Service Limits (Free Tier)

| Resource | Free Tier | Paid Starter |
|----------|-----------|--------------|
| RAM | 512 MB | 8 GB |
| CPU | Shared | 8 vCPU |
| Bandwidth | 100 GB/mo | Unlimited |
| Execution | 500 hrs/mo | Unlimited |
| Persistent Volume | ❌ | ✅ |

> **Note:** The app uses in-memory storage. Data resets on each redeploy.
> For production with persistent data, add a Railway PostgreSQL service.

---

## Environment-Specific Architecture

### Development (Replit)
```
Replit Dev Domain → Express (port 5000) → In-memory storage
Expo Go → Replit Dev Domain QR
```

### Production (Railway)
```
your-app.up.railway.app → Express (PORT from Railway) → In-memory storage
Expo Go → your-app.up.railway.app QR
```

---

## Troubleshooting

### Build fails: "Metro timeout"
- Railway's build runner may have limited memory
- Try increasing the build timeout in Railway settings
- Or pre-build the bundle locally and commit `static-build/` to git

### App shows blank screen
- Check `EXPO_PUBLIC_DOMAIN` matches Railway domain exactly (no `https://`)
- Make sure there's no trailing slash
- View Railway logs for 500 errors

### QR code doesn't work
- Expo Go must be on the same version as the SDK (54)
- The manifest endpoint: `your-app.up.railway.app/manifest`
- Check: `curl https://your-app.up.railway.app/manifest -H "expo-platform: ios"`

### WebSocket / SSE not connecting
- Railway supports WebSockets natively — no extra config needed
- SSE (Server-Sent Events) also works out of the box
- Make sure the client uses `https://` not `http://`

### "Cannot find module tsx"
- Add to build command: `npm install tsx --save-dev`
- Or use: `node -e "require('tsx/cjs'); require('./server/index.ts')"`

---

## Pre-built Bundle Strategy (Faster Deploys)

If you want Railway to skip the Metro build (faster redeploys):

1. Build locally in Replit:
   ```bash
   EXPO_PUBLIC_DOMAIN=your-app.up.railway.app EXPO_NO_TELEMETRY=1 \
     node_modules/.bin/expo export --platform web --output-dir static-build/web
   ```
2. Commit the built bundle:
   ```bash
   git add static-build/ && git commit -m "build: update web bundle"
   git push origin main
   ```
3. Change Railway build command to just: `npm install`
   (Skip `node scripts/build.js` since bundle is pre-committed)
4. Railway deploy takes ~1 minute instead of 8 minutes

> This project already commits `static-build/web/` to git, so Railway
> can serve the existing bundle without rebuilding if you set
> build command to `npm install` only.

---

## Health Check

Railway pings `/api/health` to verify the service is up.
Make sure this endpoint returns 200.

Test it:
```bash
curl https://your-app.up.railway.app/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## Full Railway CLI Workflow

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Check logs
railway logs

# Deploy manually
railway up

# Set env var
railway variables set GROQ_API_KEY=your_key_here

# Open your app
railway open
```

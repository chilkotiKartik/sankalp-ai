# SANKALP AI

SANKALP AI is a production-grade civic governance mobile app for Uttarakhand citizens and city administrators, offering real-time civic command, interactive maps, SOS features, gamification, bilingual support, and 4 integrated web portals.

## Run & Operate

```bash
# Start the backend server (primary workflow)
node_modules/.bin/tsx server/index.ts

# Rebuild web bundle for deployment
EXPO_PUBLIC_DOMAIN=sankalp-ai.replit.app EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 \
  node_modules/.bin/expo export --platform web --output-dir /tmp/web-build && \
  rm -rf static-build/web && mv /tmp/web-build static-build/web

# Required Environment Variables (all set as shared secrets):
# EXPO_PUBLIC_DOMAIN=sankalp-ai.replit.app  (set for production builds)
# GROQ_API_KEY       — primary AI (Groq LLaMA 3.1 8B, fastest)
# NVIDIA_API_KEY     — secondary AI (NVIDIA LLaMA 3.1 + Vision)
# OPENAI_API_KEY     — tertiary fallback
```

## Stack

**Frontend:**
- Framework: Expo ~54.0.27 + React Native 0.81.5 (Expo Router for file-based routing)
- State Management: React Context (AuthContext, AppContext, LanguageContext, NotificationContext)
- UI: Custom components, Animated API, LinearGradient, Ionicons, Inter fonts
- Map (native): react-native-webview + Leaflet.js (CartoDB dark tiles)
- Map (web): Leaflet.js via inline iframe srcDoc (CartoDB dark tiles)
- Voice: expo-speech (TTS alerts on SOS trigger)
- Notifications: expo-notifications (local system notifications)

**Web Portals** (React 18 + Babel standalone, SSE for live updates):
- `server/web/portal.html` → `/web/portal` — **Unified Governance Portal** (citizen + dept + admin in one)
- `server/web/dept.html` → `/web/dept` — Department Portal (standalone)
- `server/web/cpr.html` → `/web/cpr` — CPR Safety Command (fully rewritten — district filter, 18 patrol vans, all 13 districts, emergency departments, night safety, call buttons)
- `server/web/public.html` → `/web/public` — Public Civic Dashboard
- `server/web/rti.html` → `/web/rti` — RTI Filing Portal (AI drafts)

**Backend:**
- Framework: Express.js + TypeScript
- Database: In-memory storage (demo/prototype)
- Real-time: WebSocket server + SSE streams (`deptEmitter`, `cprEmitter`)
- Static Serving: Express serves `static-build/web/` + SPA fallback + no-cache on index.html

## Where things live

- `server/storage.ts`: All types, seed data (18 patrol vans, all 13 UK districts; NightSafetyZone interface + methods), storage class methods
- `server/routes.ts`: All API routes — mobile app, dept portal, CPR, public, RTI portal. `optionalAuth` middleware for AI chat.
- `server/index.ts`: Express server + portal serving at `/web/{dept,cpr,public,rti}` + SPA fallback
- `server/web/`: 5 HTML portal files (React/Babel standalone, no build step)
- `context/AppContext.tsx`: Main context — API calls, WebSocket, triggerSOS
- `app/(tabs)/sos.tsx`: Full SOS screen — shake/tap/hold/volume/voice detection + audio recording
- `app/(tabs)/ai.tsx`: AI chat — sends `Authorization: Bearer <token>` header
- `static-build/web/`: Committed web bundle (served as static SPA)

## Deployment

See `DEPLOY.md` for the full deployment guide. Key points:
- Production: click Deploy in Replit UI → runs `node scripts/build.js` (builds Expo bundles + web export) then `tsx server/index.ts`
- Portal HTML files (`server/web/*.html`) require no rebuild — served directly by Express
- Expo app changes require running `expo export --platform web` and restarting the server

## Architecture decisions

- **4 Web Portals**: Plain HTML + React 18 CDN + Babel standalone. No build step, instant deploy. Each portal cross-links to the others via `/web/` paths.
- **Dual SSE Streams**: `deptEmitter` (complaints → dept staff) and `cprEmitter` (SOS incidents → CPR command). Both are node EventEmitters with 200-listener limit.
- **CPR Patrol System**: 18 seeded patrol vans covering all 13 Uttarakhand districts. When SOS is filed, nearest active van auto-assigned, status changes to "responding", SSE streams to all CPR portal clients.
- **RTI Portal AI Draft**: Uses Groq LLaMA (primary) → NVIDIA LLaMA (secondary) → structured template (fallback). Portal auto-logins as super admin.
- **AI Chain**: Groq (`llama-3.1-8b-instant`) → NVIDIA LLaMA → local rule-based engine. All three keys set as shared secrets.
- **Unified Leaflet Map**: Both native (WebView) and web portals use Leaflet.js with CartoDB dark tiles. No Google Maps API key needed.
- **In-memory Backend Storage**: Simplifies deployment; suitable for demo/prototype.
- **Live Location in CPR**: SOS location updates (`PUT /api/sos/:id/location`) also emit to `cprEmitter` so CPR command sees live GPS in real time.
- **Women Safety SOS**: Triggers broadcast (WS) + CPR SSE + police/usdma dept SSE + **auto-creates CPR incident** (nearest van dispatched immediately). 18-sec audio auto-records.
- **Proof of Work**: Dept assigns worker (name+phone) → 6-digit PIN generated (48h TTL) → worker submits photo proof → complaint auto-resolves → SSE notifies dept.
- **Auth Token Key**: AsyncStorage key is `@sankalp_token` (not `"token"`) — all admin/worker screens must use this.
- **Uploads Serving**: `/uploads/` served as static files (complaint photos, audio recordings, SOS evidence).
- **optionalAuth**: `/api/ai/chat` uses `optionalAuth` middleware (works with or without token). Mobile app sends token; web portals don't need to.
- **Dept SSE broadens**: `complaint_new`, `complaint_updated`, `complaint_resolved_proof`, `worker_assigned`, `sos_alert`, `announcement_new` all stream to relevant dept.
- **Dept Announcements**: `POST/GET/DELETE /api/dept/:deptId/announcements` — departments post policies, schemes, emergency notices. SSE broadcasts `announcement_new` to dept stream + WebSocket broadcast to mobile app.
- **Night Safety Zones**: `POST /api/cpr/night-safety` stores report in memory, emits SSE to CPR portal. `GET /api/cpr/night-safety` returns all zones.
- **Emergency Services API**: `GET /api/cpr/emergency-services` returns 8 emergency service contacts (police, fire, ambulance, women helpline, NDRF, forest fire, child helpline, USDMA).

## Product

- **Unified Governance Portal** (`/web/portal`): One web app — citizen login (submit/track issues, SOS, RTI, dept directory), department login (live SSE feed + web notifications, workers page, SLA tracker, dept info), admin login (war room, all complaints + admin notes, SOS management, all workers, district view, announcements, broadcast). All same live data.
- **Department Portal** (`/web/dept`): 8 departments, HMAC JWT login, real-time SSE complaint stream, stats KPIs, district filter on complaints, SOS tab for all depts, worker call buttons, acknowledge/start workflow. Access codes: `{deptId}_2026`
- **CPR Safety Command** (`/web/cpr`): FULLY REWRITTEN — Leaflet map with 18 patrol vans across all 13 districts, district filter dropdown, SOS send form, incident tracking, Patrols tab (with call buttons + women-safety unit badge + map flyTo), Departments tab (8 emergency services with direct call buttons + universal emergency numbers), Night Safety tab (report unsafe areas, live list), SSE live updates, auto-dispatch nearest van, elapsed timers, incident detail modal (GPS, call officer, Google Maps link, timeline, mark safe).
- **Public Civic Dashboard** (`/web/public`): Live complaint stats, all 8 department performance grades/rates, ward health scores, tabbed views
- **RTI Portal** (`/web/rti`): AI-powered RTI draft generation, submit RTI, track status, "How It Works" guide, important contacts
- **Civic Governance**: Mobile — submit/manage complaints, track status, ward health scores
- **Real-time SOS**: Voice-announced alerts; shake ×4, tap ×6, hold 2s, Vol+×6, web keyboard (ArrowUp ×5)
- **Women Safety**: Silent panic + audio recording + voice: "Emergency alert sent. Police notified. Stay calm." + auto-creates CPR incident
- **Interactive Maps**: Leaflet (web + native) — complaints, SOS, workers, police stations, risk zones
- **Admin War Room**: District-filtered monitoring for admins/super-admins
- **AI Chat**: Groq LLaMA 3.1 8B (primary), NVIDIA LLaMA (secondary); token sent in Authorization header

## User preferences

- App color scheme: deep dark (#0d1117, #0A0F1C) with Saffron/Orange accents (#FF9933)
- Demo credentials: citizen `9876543210`/`123456`, super admin `9999999999`/`000000`
- Dept portal access codes: `{deptId}_2026` (e.g. `pwd_2026`, `police_2026`)

## Gotchas

- **Web Bundle Rebuild**: After source changes, run the `expo export` command above to regenerate `static-build/web/`. Bundle hash in filename is stable.
- **SPA Routing + No-Cache**: Server serves `index.html` with `Cache-Control: no-store` for all non-API, non-portal routes.
- **Portal HTML served by Express**: `/web/dept`, `/web/cpr`, `/web/public`, `/web/rti` are served BEFORE the SPA static files — order in `configureExpoAndLanding` matters.
- **CPR portal token expiry**: RTI portal detects 401 and clears stale localStorage token, then auto-re-logins. (In-memory server restart invalidates all tokens.)
- **DEPARTMENTS is a Record**: Use `Object.entries(DEPARTMENTS)` or `Object.values(DEPARTMENTS)` — not `.map()` directly.
- **expo-av deprecation**: Package deprecated in SDK 54 but still functional. Warning expected.
- **NVIDIA_API_KEY**: Optional. AI chat and RTI drafts fall back gracefully if missing.
- **Portal template-literal safety**: Never use CSS vars inside ternary template literals in JSX. Use `bc(active, col)` helper: `function bc(a,c){return '1px solid '+(a?(c||'var(--orange)'):'var(--border)')}`
- **Admin complaint notes**: `PUT /api/admin/complaints/:id` accepts `{status, adminNote}`. Note stored on complaint, visible in ComplaintModal.
- **Dept workers**: `GET /api/dept/:deptId/workers` returns first 30 workers (requires dept JWT).
- **ComplaintModal null guard**: `if(!c)return null` at top, and category lookup uses `Array.isArray(DEPTS[k].categories)&&` guard.

## Pointers

- Expo docs: https://docs.expo.dev/
- Leaflet.js: https://leafletjs.com/reference.html
- NVIDIA AI: https://build.nvidia.com/
- react-native-webview: https://github.com/react-native-webview/react-native-webview

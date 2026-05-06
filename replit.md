# SANKALP AI

SANKALP AI is a production-grade civic governance mobile app for Uttarakhand citizens and city administrators, offering real-time civic command, interactive maps, SOS features, gamification, bilingual support, and 4 integrated web portals.

## Run & Operate

```bash
# Start the backend server
node_modules/.bin/tsx server/index.ts

# Rebuild web bundle for deployment
EXPO_PUBLIC_DOMAIN=sankalp-ai.replit.app EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 \
  node_modules/.bin/expo export --platform web --output-dir static-build/web
```

**Required Environment Variables:**
- `EXPO_PUBLIC_DOMAIN`: `sankalp-ai.replit.app` (for production builds)
- `GROQ_API_KEY`: Primary AI (Groq LLaMA 3.1 8B)
- `NVIDIA_API_KEY`: Secondary AI (NVIDIA LLaMA 3.1 + Vision)
- `OPENAI_API_KEY`: Tertiary AI fallback

## Stack

**Frontend:**
- Framework: Expo ~54.0.27 + React Native 0.81.5 (Expo Router)
- State Management: React Context
- UI: Custom components, Animated API, LinearGradient, Ionicons, Inter fonts
- Map: Leaflet.js (via react-native-webview for native, inline iframe for web)
- Voice: `expo-speech` (TTS alerts)
- Notifications: `expo-notifications` (local system notifications)

**Web Portals:** (React 18 + Babel standalone, SSE for live updates)
- Unified Governance Portal (`/web/portal`)
- Department Portal (`/web/dept`)
- CPR Safety Command (`/web/cpr`)
- Public Civic Dashboard (`/web/public`)
- RTI Filing Portal (`/web/rti`)

**Backend:**
- Framework: Express.js + TypeScript
- Database: In-memory storage (demo/prototype)
- Real-time: WebSocket server + SSE streams (`deptEmitter`, `cprEmitter`)
- Static Serving: Express serves `static-build/web/` + SPA fallback

## Where things live

- `server/storage.ts`: Types, seed data, storage class methods
- `server/routes.ts`: All API routes
- `server/index.ts`: Express server, portal serving, SPA fallback
- `server/web/`: HTML portal files
- `context/AppContext.tsx`: Main context for API, WebSocket, SOS
- `app/(tabs)/sos.tsx`: SOS screen with various detection methods
- `app/(tabs)/ai.tsx`: AI chat interface
- `static-build/web/`: Committed web bundle

## Architecture decisions

- **Expo Router Platform Split**: `.web.tsx` files override `.tsx` for web platform specifics.
- **4 Web Portals**: Built with plain HTML + React 18 CDN + Babel standalone for instant deploy and no build step.
- **Dual SSE Streams**: `deptEmitter` for complaints to staff, `cprEmitter` for SOS incidents to command.
- **AI Chain**: Groq (`llama-3.1-8b-instant`) → NVIDIA LLaMA → local rule-based engine.
- **Unified Leaflet Map**: Both native and web use Leaflet.js with CartoDB dark tiles.
- **In-memory Backend Storage**: Simplifies deployment for demo/prototype.
- **Women Safety SOS**: Triggers broadcast (WS), CPR SSE, police/USDMA dept SSE, auto-creates CPR incident with audio recording.
- **Live Worker GPS Stream**: `GET /api/workers/stream` SSE endpoint with simulated movement.
- **CPR Patrol Leaderboard**: Ranks officers based on resolved incidents, women-safety dispatches, and response rate.

## Product

- **Unified Governance Portal**: Single web app for citizens, departments, and administrators.
- **Department Portal**: Real-time SSE complaint stream, KPIs, worker management, SOS tab.
- **CPR Safety Command**: Interactive Leaflet map with patrol vans, incident tracking, and officer leaderboard.
- **Public Civic Dashboard**: Live complaint stats and department performance.
- **RTI Portal**: AI-powered draft generation, submission, and tracking.
- **Civic Governance Mobile App**: Submit/manage complaints, track status, ward health scores.
- **Real-time SOS**: Multiple trigger methods (shake, tap, hold, volume, voice, keyboard) with voice announcements.
- **Interactive Maps**: Display complaints, SOS, workers, police stations, risk zones.
- **Admin War Room**: District-filtered monitoring with KPIs and granular data.
- **AI Chat**: AI assistant using Groq and NVIDIA models.
- **Emergency Directory**: Quick-dial grid and tabbed service list with map integration.
- **Chunked Audio Streaming**: Women Safety SOS records and uploads 10-second audio chunks for live monitoring.

## User preferences

- App color scheme: deep dark (#0d1117, #0A0F1C) with Saffron/Orange accents (#FF9933)
- Demo credentials: citizen `9876543210`/`123456`, super admin `9999999999`/`000000`
- Dept portal access codes: `{deptId}_2026` (e.g. `pwd_2026`, `police_2026`)

## Gotchas

- **Web Bundle Rebuild**: Must run `expo export` after source changes to update `static-build/web/`.
- **SPA Routing + No-Cache**: `index.html` is served with `Cache-Control: no-store` for non-API/non-portal routes.
- **Portal HTML served by Express**: Portal routes (`/web/*`) are served before SPA static files.
- **CPR portal token expiry**: RTI portal handles 401 by clearing and re-logging in.
- **`DEPARTMENTS` is a Record**: Use `Object.entries()` or `Object.values()` to iterate.
- **`expo-av` deprecation**: Warning is expected but still functional.
- **`NVIDIA_API_KEY`**: Optional, AI falls back gracefully if missing.
- **Portal template-literal safety**: Avoid CSS vars in ternary template literals; use `bc(active, col)` helper.
- **Worker status values**: Use `"active" | "idle" | "on_leave"`.

## Pointers

- Expo docs: https://docs.expo.dev/
- Leaflet.js: https://leafletjs.com/reference.html
- NVIDIA AI: https://build.nvidia.com/
- react-native-webview: https://github.com/react-native-webview/react-native-webview
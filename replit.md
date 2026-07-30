# SANKALP AI

Delhi's AI-first civic engagement platform — connecting 20M+ citizens to ward officers, police stations, and government services.

## Stack

- **Frontend:** Expo SDK 54 + React Native (Expo Router v6, file-based routing)
- **Backend:** Express.js + TypeScript on Node.js 20
- **Real-time:** WebSocket (`ws`)
- **Auth:** JWT (24h) + bcrypt
- **Storage:** In-memory (interface ready for PostgreSQL)
- **AI:** GROQ (primary) / NVIDIA / OpenAI (fallbacks)

## How to run

Both workflows start automatically via the **Project** run button:

| Workflow | Command | Port |
|----------|---------|------|
| `Start application` | `node_modules/.bin/tsx server/index.ts` | 5000 |
| `Start Expo Dev Server` | `expo start --localhost --port 8080` | 8080 |

The Express server on port 5000 serves:
- `/api/*` — REST API + WebSocket
- `/web/dept`, `/web/cpr`, `/web/public`, `/web/rti`, `/web/portal` — HTML portals
- `/*` — Expo web SPA (from `static-build/web/`)

The Expo Dev Server on port 8080 serves a QR code for scanning with Expo Go on a physical device.

## Environment variables (Secrets)

| Variable | Purpose | Required |
|----------|---------|----------|
| `EXPO_PUBLIC_DOMAIN` | Production domain for Expo web bundle | Yes |
| `GROQ_API_KEY` | Primary AI (LLaMA 3.1 8B) | Yes (one AI key minimum) |
| `NVIDIA_API_KEY` | Secondary AI + RTI draft generation | Optional |
| `OPENAI_API_KEY` | Tertiary AI fallback | Optional |
| `SESSION_SECRET` | Express session signing | Yes |

## Build (for production)

```bash
node scripts/build.js   # builds Expo web bundle into static-build/web/
```

## User preferences

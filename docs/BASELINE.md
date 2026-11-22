# Baseline (before any Phase 0 change) — commit e0dc721, 2026-11-21

Node v22.23.5, npm 10.9.9. Dependencies installed with `npm ci --ignore-scripts`.

## TypeScript — `npx tsc --noEmit` (exit 2)
```
server/replit_integrations/audio/routes.ts(23,27): error TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'.
  Type 'string[]' is not assignable to type 'string'.
server/replit_integrations/audio/routes.ts(51,27): error TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'.
  Type 'string[]' is not assignable to type 'string'.
server/replit_integrations/audio/routes.ts(65,39): error TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'.
  Type 'string[]' is not assignable to type 'string'.
server/replit_integrations/batch/utils.ts(110,30): error TS2339: Property 'AbortError' does not exist on type '<T>(input: (attemptNumber: number) => T | PromiseLike<T>, options?: Options | undefined) => Promise<T>'.
server/replit_integrations/batch/utils.ts(159,32): error TS2339: Property 'AbortError' does not exist on type '<T>(input: (attemptNumber: number) => T | PromiseLike<T>, options?: Options | undefined) => Promise<T>'.
server/replit_integrations/chat/routes.ts(25,27): error TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'.
  Type 'string[]' is not assignable to type 'string'.
server/replit_integrations/chat/routes.ts(53,27): error TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'.
  Type 'string[]' is not assignable to type 'string'.
server/replit_integrations/chat/routes.ts(65,39): error TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'.
  Type 'string[]' is not assignable to type 'string'.
server/replit_integrations/chat/storage.ts(1,20): error TS2307: Cannot find module '../../db' or its corresponding type declarations.
server/replit_integrations/chat/storage.ts(2,10): error TS2305: Module '"@shared/schema"' has no exported member 'conversations'.
server/replit_integrations/chat/storage.ts(2,25): error TS2305: Module '"@shared/schema"' has no exported member 'messages'.
server/replit_integrations/image/client.ts(23,18): error TS18048: 'response.data' is possibly 'undefined'.
server/replit_integrations/image/client.ts(50,23): error TS18048: 'response.data' is possibly 'undefined'.
server/replit_integrations/image/routes.ts(20,25): error TS18048: 'response.data' is possibly 'undefined'.
```

## ESLint — `npx eslint .` (exit 1): 21,447 problems (11,859 errors, 9,588 warnings)
Most errors come from committed build bundles. Errors per top-level path:
```
static-build: 6164 errors
dist-web: 5263 errors
public: 411 errors
app: 19 errors
components: 1 errors
server: 1 errors
```
`npx expo lint` (source only): 146 problems (20 errors, 126 warnings).

## Tests
None exist (no test script, no test files).

## npm audit --omit=dev
```
44 vulnerabilities (2 low, 18 moderate, 22 high, 2 critical)
```

## Server boot — `PORT=5056 npx tsx server/index.ts`
```
[NVIDIA] API key: MISSING
[GROQ]   API key: MISSING
[OPENAI] API key: MISSING
Serving static Expo files with dynamic manifest routing
Expo routing: Checking expo-platform header on / and /manifest
express server serving on port 5056
GET /api/health 200 in 7ms :: {"status":"ok","timestamp":"2026-11-21T14:21:53.8…
```
`GET /api/health` → 200. `GET /healthz` → 200 but only because the SPA fallback serves index.html (no real health route).

## Known broken behaviours
See AUDIT_REPORT.md (C1–C9, H1–H14, M1–M16), each reproduced against a local instance.

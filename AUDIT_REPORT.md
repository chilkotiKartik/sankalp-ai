# SANKALP AI — Deep Technical & Security Audit

**Audit date:** 2026-11-21 · **Commit audited:** `69ae934` (branch `claude/sleepy-turing-n6wo0u`)
**Scope:** Express backend (`server/`), Expo/React Native client (`app/`, `context/`, `lib/`, `components/`), web portals (`server/web/*.html`), build/deploy config, docs, and repo hygiene.
**Method:** Line-by-line code review, plus **live checks against a local instance** (`npx tsx server/index.ts` on localhost). Every item marked **✅ Verified** was reproduced. Nothing was run against the deployed Render or Replit servers.

---

## 0. Executive Summary

SANKALP AI is a large, feature-rich **prototype**: about 31,600 lines across 60+ screens and portals. The UI work is substantial, but **the backend is not safe to put in front of real citizens.** That matters most for the women-safety SOS feature.

| Severity | Count | Theme |
|---|---|---|
| 🔴 Critical | 9 | SOS victim data broadcast, unauthenticated police command center, public admin credentials, forgeable department tokens, anyone can close any complaint |
| 🟠 High | 14 | IDORs on SOS/chat/RTI, stored XSS, rate-limit bypass, broken photo/audio uploads, random complaint GPS, SOS "sent" even when it failed |
| 🟡 Medium | 16 | No persistence, memory growth, broken SSE, misleading AI/"blockchain" features, stale closures |
| 🔵 Low / Hygiene | 12+ | 40 MB of committed build artifacts and zips, doc and licence contradictions, 44 npm vulnerabilities, lint errors |

**The three most urgent problems:**

1. **A woman's panic SOS is pushed to every logged-in user in the state, and to anonymous internet users.** This includes her name, phone number and live GPS. ✅ Verified. Anyone who is stalking her gets a live tracker.
2. **Anyone can log in as Super Admin.** `9999999999` / `000000` is seeded in the server, shipped in the client bundle and printed in the README. ✅ Verified.
3. **All data is in memory.** Every restart (Render free tier sleeps when idle) wipes users, complaints, SOS records and audio evidence, and logs everyone out.

> **Verdict:** Fine as a hackathon or demo build. **Not production ready**, even though the README says *"Status: Production Ready"*. Do not run a real-world pilot (real citizens, real police) until at least the Critical and High items are fixed.

---

## 1. Architecture Snapshot (as actually implemented)

```
Expo app (iOS/Android/Web) ──HTTP/WS──► Express 5 (server/index.ts, routes.ts 2,140 LOC)
                                             │
                                             ├─ storage.ts (1,722 LOC) — ALL DATA IN JS MEMORY (Maps/arrays)
                                             ├─ WebSocket /ws  — one global broadcast to every client
                                             ├─ SSE /api/cpr/stream, /api/dept/:id/stream, /api/workers/stream
                                             ├─ AI: OpenAI SDK → Groq (via `curl` child process) → NVIDIA (curl) → regex canned replies
                                             └─ Static: 7 portal HTML files (React 18 + in-browser Babel from unpkg)
```

* `pg`, `drizzle-orm`, `drizzle-kit` and `shared/schema.ts` are **installed but never used**. The only schema is a 2-column `users(username,password)` table left over from a template.
* `jsonwebtoken` is installed but **never used**. Tokens are random UUIDs kept in a `Map`.
* `server/replit_integrations/**` is **dead code**. It is not imported anywhere and produces all 14 TypeScript errors (it imports `../../db`, which doesn't exist).

---

## 2. 🔴 Critical Findings

### C1. Women-safety SOS (name, phone, live GPS) is broadcast to every user ✅ Verified
* `server/routes.ts:457-463`: `broadcast()` sends to **every** connected WebSocket client, with no filter by role or district.
* `server/routes.ts:831-843`: the women-safety payload contains `triggeredBy`, `phone`, `alert.geo` and nearest stations, and goes through `broadcast(payload)`.
* `server/storage.ts:1264` and `1273` also call `broadcastEvent` with the full alert and **every live-location update**.
* **Reproduced:** a citizen in *Dehradun* connected to `/ws` and received a *Haridwar* victim's SOS: `Victim 7000000002 {"lat":29.95,"lng":78.16}`.
* The same leak applies to complaints (`storage.ts:1204`, full complaint object), chat messages (`1489`), forest-fire SOS, CPR requests (`routes.ts:1568`, which includes the phone) and night-safety reports.
* **Fix:** keep a per-socket `{userId, role, district}`. Send SOS and PII events only to `admin`/`super_admin` sockets in that district, plus the victim's own sockets. Citizens should get only sanitized, aggregate events.

### C2. The CPR Safety Command Center and its whole API have no authentication ✅ Verified
`server/routes.ts:1798-1916`. None of these routes use any auth middleware:

| Endpoint | Impact |
|---|---|
| `GET /api/cpr/stream` (SSE, `Access-Control-Allow-Origin: *`) | **Anonymous live feed of every SOS**: victim name, phone, GPS, audio chunk URLs. ✅ Reproduced with plain `curl -N`. |
| `GET /api/cpr/incidents` | Lists every safety incident with citizen names and locations |
| `PUT /api/cpr/incidents/:id/update` | **Anyone can mark a victim "safe"/"closed"** and free the patrol van |
| `POST /api/cpr/incidents` | Anyone can create fake incidents and pull vans off real calls |
| `PUT /api/cpr/patrols/:id/location` | Anyone can spoof police van GPS |
| `GET /api/cpr/leaderboard` | Officers' personal phone numbers (✅ `SI Priya Rana 9412012002`) |
| `POST /api/cpr/night-safety` | Anonymous spam, then broadcast to all users |

`server/web/cpr.html` and `pcr.html` have **no login at all** (0 auth references). The README lists a `cpr_2026` code, but nothing ever checks it.

### C3. Public, hard-coded administrator credentials ✅ Verified
* Seeded in `server/storage.ts:754-806`: super admin `9999999999/000000`, six district admins (`111111`…`666666`) and 20 citizens, all with **plain-text PINs**.
* Bundled in the client: `context/AuthContext.tsx:35-52` (`DEMO_USERS`), so they ship in every APK and web bundle.
* Published in `README.md:469-483`.
* `routes.ts:522-529` deliberately accepts **plain-text PIN comparison** ("legacy") for these accounts.
* Since `/` serves the web app and the server is public on Render, anyone can take over **state-wide super admin**. That gives them every complaint, every SOS with audio evidence, emergency broadcasts to all users, and RTI responses.
* **Fix:** remove the seeded privileged accounts, or create them from env vars at first boot with hashed PINs. Delete `DEMO_USERS` and the plaintext branch. Never publish credentials for a deployed instance.

### C4. Department portal: guessable access codes and a forgeable token secret ✅ Verified
* `routes.ts:1606`: the access code check is `accessCode !== \`${departmentId}_2026\``. The codes are also **printed as clickable chips on the login page** (`server/web/dept.html:1281`).
* `routes.ts:1573`: `DEPT_SECRET = process.env.DEPT_JWT_SECRET || "sankalp-dept-secret-2026"`. With the default secret, anyone can **mint tokens for any department with any expiry**. ✅ A forged `police` token was accepted.
* `routes.ts:1587`: HMAC compared with `!==` (not constant-time; minor next to the above).
* **Fix:** per-department hashed credentials, a required secret (fail at startup if it's missing), `crypto.timingSafeEqual`, and short-lived tokens.

### C5. Any citizen can mark any complaint "resolved" and farm points ✅ Verified
* `routes.ts:600-607` → `storage.ts:1221-1237`. There is no check of ownership, role or district. Every call adds **+5 points**, with no limit.
* Reproduced: an attacker resolved the same complaint 3 times and went from 0 to 15 points. Repeat that and the user tops the public leaderboard (`/api/leaderboard`).
* The "3 rejections reopen it" control (`storage.ts:1239`) can be defeated with Sybil accounts, since registration is open and limited only by spoofable IP.
* **Fix:** only the complainant may *confirm* resolution, only after an officer set the status to `resolved`, and points should be awarded once.

### C6. Worker temporary PINs are returned to every citizen, so anyone can submit "proof" ✅ Verified
* `storage.ts:1510` stores `assignedWorkerPin` **on the complaint object**. `GET /api/complaints` returns complaint objects untouched.
* Reproduced: a citizen read `phone=7111111111 pin=888733` off a complaint, then called the **unauthenticated** `PUT /api/complaints/:id/proof` (`routes.ts:1519`). It returned `status: resolved`.
* The PIN is also written into audit logs (`routes.ts:1550`) and returned to the dept portal.
* **Fix:** never store or serialize the PIN (store a hash in `workerTempTokens` only), and add a response DTO layer that whitelists fields per role.

### C7. Department actions ignore department and district boundaries
* `PUT /api/dept/complaints/:id` (`routes.ts:1712`) and `PUT /api/dept/complaints/:id/assign-worker` (`routes.ts:1537`): **any** department token can change **any** complaint, including setting `status` to an arbitrary string.
* `PUT /api/admin/complaints/:id` (`routes.ts:732`): a district admin can edit complaints in **other districts**, and `status` isn't validated (e.g. `"hacked"`).
* `DELETE /api/announcements/:id` (`routes.ts:988`): any district admin can delete state-level or other districts' announcements.
* `PUT /api/sos/:id/resolve`, `PUT /api/rti/:id/respond`: any admin, any district.
* `POST /api/admin/emergency-broadcast` (`routes.ts:799`): a *district* admin can push a full-screen emergency alert to **every user in the state** (the client shows it via `setEmergencyAlert`).

### C8. No persistence: every restart wipes the platform
* `storage.ts:676-741`: every collection is an in-memory `Map`/array. `pushTokenStore` and the rate-limit map are too.
* Render's free tier (the `eas.json` target is `sankalp-ai.onrender.com`) sleeps when idle. On wake, **all registered users, complaints, SOS records, RTIs and session tokens are gone** and the seed data is regenerated with *new random values*.
* Ticket IDs, complaint IDs and audio URLs shared with citizens stop working.
* Uploaded files are written to `./uploads` on an ephemeral container disk (`routes.ts:1472`), so SOS audio evidence is also lost.

### C9. Stored XSS through the upload endpoint (same origin as the app) ✅ Verified
* `routes.ts:1474`: `ext = filename.split(".").pop()`, taken from user input with no allow-list. The content isn't checked either.
* Reproduced: uploading `filename: "x.html"` with a `<script>` payload is served from `/uploads/…html` as `Content-Type: text/html` **on the app's own origin**.
* The web app stores the session token in `localStorage` (`@sankalp_token` via AsyncStorage-web). One link sent to an admin hands over their token, and with a super admin's token, the whole system.
* **Fix:** allow-list `jpg|jpeg|png|webp|m4a|aac`, check magic bytes, serve uploads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, or move uploads to object storage on a separate domain.

---

## 3. 🟠 High Findings

| # | Finding | Location | Notes |
|---|---|---|---|
| H1 | **SOS can be tampered with by any user (IDOR)**: overwrite live location, audio URL, audio chunks of *someone else's* SOS | `routes.ts:638` (`/sos/:id/location`), `930` (`/audio-url`), `1861` (`/audio-chunk`) | No `alert.userId === user.id` check (createSos doesn't even store userId). An attacker can move a victim's pin or replace the evidence. |
| H2 | **SOS says "sent" when it failed** | `app/(tabs)/sos.tsx:541-570` | Text-to-speech says *"Emergency alert sent. Police and help notified. Help is on the way."* **before** the request. Any network or 5xx failure is swallowed by `catch {}`. There's no retry, SMS fallback or auto-dial of 112. For a safety app this is life-critical. |
| H3 | **Complaint GPS is random** | `app/(tabs)/complaints.tsx:364` | `geo: { lat: 30.0668 + (Math.random()-0.5)*2.8, … }`. GPS is captured but only used as a text label, so the real coordinates are thrown away. Maps, ward routing, hotspot/cluster/anomaly detection (`routes.ts:2023`) and "nearest worker" all run on noise. |
| H4 | **Photo evidence never reaches the server** | `complaints.tsx:338-343, 846-852, 370` | On native, `beforePhoto` is a device-local `file://` URI, so officers see nothing. On web it's an inline data URL inside the complaint JSON, which hits the 100 KB body limit (H6). `/api/upload` exists but the complaint flow never calls it. |
| H5 | **AI image-authenticity check never works on native** | `complaints.tsx:310-322` | It sends `photoUri` (a `file://` path) as `imageBase64`. The server builds `data:image/jpeg;base64,file:///…`, the AI fails, and the fallback returns `isReal:true, confidence:50`. (The correctly built `base64` variable on line 317 is unused.) |
| H6 | **Express JSON limit is 100 KB, so SOS audio uploads fail** ✅ Verified (HTTP 413) | `server/index.ts:62-68` | `express.json()` has no `limit`. A 10 s m4a chunk is about 80-160 KB and grows ~33% as base64. Upload fails, and `sos.tsx:507` swallows the error. **The audio-evidence feature silently doesn't work.** The same applies to image analysis. |
| H7 | **Vision AI via curl argv breaks on real photos** | `routes.ts:166-182, 216-239` | The base64 image is passed as a `-d` **command-line argument**. Linux caps a single argument at 128 KB (`MAX_ARG_STRLEN`), so most photos fail with `E2BIG`. API keys also show in `ps` output. Use `fetch` (Node 22 has it; `rti/ai-draft` already does). |
| H8 | **Rate limits bypassed with `X-Forwarded-For`** ✅ Verified (15 attempts, no 429) | `routes.ts:435-436` | It trusts the client-supplied header. Login is a 6-digit PIN (10⁶ space), so the PIN can be brute-forced. There's also **no per-account lockout**. `worker-login` and `/proof` have no rate limit at all. Use `app.set('trust proxy', 1)` + `req.ip`, plus per-phone attempt counters. |
| H9 | **Complaint chat and audit trail readable and writable across districts** | `routes.ts:1107-1118, 1157` | Any user can read or post on any complaint's chat and read its audit log. |
| H10 | **RTI submit IDOR, citizen-chosen district** | `routes.ts:1072, 1791` | Anyone can change any RTI's status. A citizen can file into any district. |
| H11 | **AI chat: anonymous, prompt-injectable LLM proxy** | `routes.ts:1253-1267` | `optionalAuth` lets anonymous users spend your OpenAI/Groq/NVIDIA quota, limited only by the bypassable 30/min. Client `history[].role` passes straight through, so it can be `"system"`. `content` length is unlimited. |
| H12 | **Complainant PII exposed** | `routes.ts:554-558` | Citizens get every complaint in their district with `submittedBy`, `submittedByPhone`, `upvotedBy` (user IDs), photos and worker phone numbers. |
| H13 | **Public endpoints expose all-state operations data** | `routes.ts:1127-1149, 1919-2055` | `/api/public/*` returns ward health, stats and anomalies with no auth. That may be intended, but check it's deliberate, especially `/api/cpr/emergency-locations`. |
| H14 | **CORS reflects any origin when none is set, and allows any `*.replit.dev`** | `server/index.ts:41-50` | Any Replit-hosted page can make credentialed calls. Use an explicit allow-list per environment. |

---

## 4. 🟡 Medium Findings

1. **Push notifications for complaint status never fire.** `routes.ts:742` and `1721` read `c.userId || c.submittedById`, but `createComplaint` never stores a user ID (`routes.ts:564-580`), so `sendComplaintStatusPush` always returns early.
2. **Dept portal real-time feed is broken.** `dept.html:1113` opens `EventSource('/api/dept/:id/stream')`, but `requireDeptAuth` reads the `Authorization` header, which `EventSource` can't send, so it always gets 401. The same is true of `app/admin/workermap.web.tsx:193` → `/api/workers/stream` (`requireAuth`).
3. **Duplicate `GET /api/departments` route.** Line 775 (`requireAuth`) shadows line 1614 (public). Unauthenticated callers get **401** ✅ verified, and the second handler can never run.
4. **SLA job grows memory without limit and spams alerts.** `routes.ts:995-1008` re-logs an audit entry **and** broadcasts `sla_breach` for *every* breached complaint *every 5 minutes, forever*. The 5,000-entry cap pushes real audit history out within hours.
5. **Fake "tamper-proof" audit hashes.** `storage.ts:1603` uses `hash = 0x + 40 random hex chars`. It isn't derived from content or chained to the previous entry. Calling it an integrity guarantee misleads officials.
6. **Fabricated "AI" outputs.** `aiScore` and `aiConfidence` are `rndInt(62,99)` (`storage.ts:1196`). The predictive alerts show fixed text such as *"73% increase in pothole reports over 14 days"* whatever the data (`storage.ts:1569-1576`). The worker "live GPS" is a random walk every 8 s (`routes.ts:29-44`). The QR code is a random dot pattern no scanner can read (`routes.ts:132-154`). Bills and payments are hard-coded mocks that "succeed" after 1.5 s (`routes.ts:2058-2137`). **All of these must be clearly labelled as demo/simulated in the UI.** They are presented as real government data.
7. **Ticket ID collisions.** `UK-${rndInt(10000,99999)}` has a 90k space, so by the birthday bound a collision is likely around ~350 complaints. Same for RTI IDs.
8. **WebSocket reconnect leak.** `context/AppContext.tsx:403-407`: `onclose` reconnects whenever `tokenRef.current` is set, including after the cleanup's own `ws.close()` and after a 4001 "Unauthorized" close (e.g. post-restart). The result is zombie sockets and an endless 5 s reconnect loop.
9. **Thundering herd.** Every `upvote` or `resolved` event anywhere in the state makes **every client** reload **8 endpoints** (`AppContext.tsx:396-397`). On top of that, every client polls 8 endpoints every 60 s.
10. **Duplicate events.** `sos_location_update` is broadcast twice with different shapes (`storage.ts:1273` uses `id`, `routes.ts:653` uses `alertId`). `safety_incident_new` is emitted twice per women-safety SOS (`storage.ts:1667` + `routes.ts:865`). ✅ Seen in the SSE output.
11. **Announcement views inflate on every fetch.** `routes.ts:968` increments views for every announcement whenever the list loads, including the 60 s background poll.
12. **SOS panic triggers only work in the foreground on the SOS tab.** Shake, AppState and volume listeners live in `sos.tsx` effects, and JS sensors stop in the background. The README's "5 independent panic triggers" can't be relied on.
13. **Stale closure in the side-button trigger.** `sos.tsx:351-365` calls `activateWomenSafety` from a `[]`-deps effect, so it captures the first-render `womenPanic`. Unlike the shake trigger, it doesn't use the ref, so it can double-fire.
14. **False SOS location fallback.** When there's no GPS fix, `sos.tsx:551` sends the **district centre** as if it were the victim's location, without flagging it as approximate.
15. **Shake false positives.** A summed 3-axis delta > 2.5 at 80 ms, 4 times in 2 s (`sos.tsx:334-345`), is reachable while running or in a bouncing bag. Each false trigger publishes the user's location (see C1).
16. **WS token in the query string** (`AppContext.tsx:378`). It ends up in proxy and access logs. Prefer a first-message auth handshake.

---

## 5. 🔵 Low / Code Quality / Hygiene

* **Production runs the dev toolchain.** `railway.json` and `nixpacks.toml` start with `tsx server/index.ts` and install with `npm install --legacy-peer-deps` instead of `npm ci`. The `server:build`/`server:prod` esbuild pipeline exists but isn't used.
* **`curl` is a hidden runtime dependency** (`routes.ts:176`). If the deploy image doesn't have it, Groq and NVIDIA fail silently and users get canned regex replies labelled "SANKALP AI".
* **`npm audit --omit=dev`: 44 vulnerabilities (2 critical, 22 high, 18 moderate, 2 low)**, including `body-parser`, `drizzle-orm <0.45.2`, `follow-redirects` and `compression`.
* **`expo lint`: 146 problems (20 errors, 126 warnings)**, including **real bugs**: `react-hooks/rules-of-hooks` violations (`useFallback` called inside callbacks and non-hook functions).
* **TypeScript: 14 errors**, all in the dead `server/replit_integrations/**`. Delete that folder (and `.replit_integration_files/`).
* **80 empty `catch {}` / `.catch(() => {})` blocks** across `app/`, `context/` and `server/`. Failures, including SOS failures, are invisible.
* **Pervasive `as any`** (`(req as any).user`, `(c as any).ticketId`, …) defeats TypeScript's checks. There's **no input validation**, even though `zod` is a dependency: no length limits on description, chat or announcements, and no enum checks on category, status or priority.
* **Web portals load unpinned `react@18`, `react-dom@18` and `@babel/standalone` from unpkg, with no SRI**, and compile JSX in the browser on every load. That's slow, and if unpkg is compromised so are your police and department portals.
* **Bcrypt cost 10** (README claims 12). **Tokens last 7 days** (README claims 24 h JWT).
* **Error messages leaked to clients:** `routes.ts:512, 538, 1480, 1502` return `err.message`.
* **Request logger** writes response bodies (truncated to 80 chars) to stdout, so PII can land in logs.
* **`/api/qr/:id`** reflects `id` into a URL, and `size` is unbounded.
* **No security headers** (helmet/CSP/HSTS), no `X-Content-Type-Options`, and no request timeouts.
* **`setInterval` timers at module load** (`routes.ts:29, 451`) keep running in tests and prevent clean shutdown. No graceful shutdown on `SIGTERM`.

### Repo hygiene
| Issue | Detail |
|---|---|
| Committed build output | `dist-web/` (7 MB), `static-build/` (12 MB) and two hashed JS bundles are in git, and the server serves `static-build` directly. Stale bundles get deployed. |
| Committed archives | `zipFile.zip` (9.4 MB, a copy of the source), plus 2 identical 1.5 MB zips in `attached_assets/`. `.gitignore` has `*.zip`, but these were committed before that rule. |
| `attached_assets/` (11 MB) | ~90 screenshots and pasted AI-prompt transcripts. Not product code. |
| Repo size | `.git` is 30 MB for ~250 files. |
| Doc sprawl | 9 Markdown docs (`DEPLOY.md`, `DEPLOYMENT_GUIDE.md`, `DEPLOY_RAILWAY.md`, `EXPO_GO_DEPLOYMENT.md`, `replit.md`…) target 4 different hosts (Replit, Railway, Render, EAS). |
| `.env.example` is wrong | It lists `NEXT_PUBLIC_API_URL`, `AI_TRIAGE_MODEL_KEY` and a **MongoDB** `DATABASE_URL`. This is not a Next.js or Mongo project. The real variables (`GROQ_API_KEY`, `NVIDIA_API_KEY`, `OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_*`, `DEPT_JWT_SECRET`, `EXPO_ACCESS_TOKEN`, `PORT`) are missing. |
| Licence contradiction | `LICENSE` is **MIT**, while the README shows **"All Rights Reserved"** badges (lines 17, 571). Pick one. |
| Hard-coded domains | CORS allows `sankalp-ai.replit.app`, the apps target `sankalp-ai.onrender.com`, and the QR uses `sankalp.uk.gov.in`. They're inconsistent. |
| No tests | There's no test suite or CI workflow at all. |
| ✅ Good | No live API keys or credentials found in the working tree **or git history** (only placeholder `sk-` strings). `.env` is git-ignored. |

---

## 6. README Claims vs Reality

| README says | Code does |
|---|---|
| "Status: Production Ready" | In-memory prototype with critical auth gaps |
| "Tokens: JWT, 24-hour expiry" | Random UUID in a `Map`, 7-day expiry, lost on restart |
| "bcrypt (12 salt rounds)" | 10 rounds; plaintext PINs accepted for seeded users |
| "Every route protected by auth middleware" | ~25 routes have no auth, including the whole CPR safety API and worker proof |
| "SOS at 10 req/min" rate limit | No rate limit on any SOS route |
| `SESSION_SECRET` "Required" | Never read anywhere |
| "Drizzle schema already production-ready" | Schema is a 2-column template `users` table, unrelated to the app's models |
| "2 nearest police stations are auto-notified with live GPS" | Nothing is sent to any police station. Data goes to a WS broadcast and an unauthenticated SSE page. |
| AI photo authenticity detection | Never receives image bytes on native (H5); defaults to "real" |
| Live worker GPS | `Math.random()` walk |

---

## 7. What's Done Well

* A big, coherent feature set with careful attention to the local context: 13 districts, Hindi/English, real helpline numbers and departments.
* The AI layer degrades gracefully (OpenAI → Groq → NVIDIA → local rules), so the app never shows a blank reply.
* Bcrypt for new registrations; token revocation on logout; WebSocket requires a token.
* Several dept routes check `req.params.deptId === token.deptId`. `deleteAnnouncement` for departments checks ownership. That's the right pattern; it just needs applying everywhere.
* Web portals use React's escaping instead of `innerHTML`, so I found no DOM XSS in the portals.
* Leaflet is self-hosted to avoid CDN blocking, a thoughtful production detail.
* No secrets committed.

---

## 8. Prioritised Remediation Plan

### Phase 0 — Before any more public exposure (1–2 days)
1. Remove the seeded admin/super-admin accounts and `DEMO_USERS`, drop plaintext-PIN login, and **rotate** by redeploying (sessions are in memory, so a restart clears them).
2. Put auth plus a `police`/`cpr` role on **all** `/api/cpr/*` routes and the CPR/PCR portals.
3. Scope `broadcast()` by role and district; strip phone and GPS from anything citizens receive.
4. Require `DEPT_JWT_SECRET` (crash if it's missing); replace `${id}_2026` codes; remove the code chips from `dept.html`.
5. Lock `/complaints/:id/resolve` to the complainant after officer resolution; award points once.
6. Stop serializing `assignedWorkerPin`; add `requireAuth` or a rate limit to `/proof` and `/worker-login`.
7. Allow-list upload extensions and send `nosniff` + `Content-Disposition`.
8. Use `app.set("trust proxy", 1)` and key rate limits on `req.ip` and on phone number.

### Phase 1 — Make core flows actually work (1 week)
9. Send real GPS in complaints (H3). Upload photos via `/api/upload` and store URLs (H4/H5).
10. Raise the JSON limit on upload routes only (`express.json({limit:"10mb"})` per route), or use multipart/`multer` (H6).
11. Replace `curl` with `fetch` (H7).
12. SOS: speak and show "sent" only **after** a 2xx response; retry with backoff; on failure, offer to dial 112 or send an SMS automatically (H2).
13. Store `userId` on complaints and SOS records; enforce ownership on every `:id` route (H1, H9, H10, M1).
14. Pass the token as `?token=` (validated) or use cookie auth for SSE (M2). Remove the duplicate `/api/departments` route (M3).

### Phase 2 — Production foundations (2–4 weeks)
15. **Real persistence:** PostgreSQL + Drizzle schemas for every entity; uploads in S3/R2; sessions in DB or Redis.
16. Add a `zod` validation layer for every request body; add response DTOs per role.
17. helmet/CSP, structured logging without PII, graceful shutdown, health and readiness probes.
18. Make the SLA job idempotent (flag `slaBreachedAt`); content-hash-chained audit log, or drop the "hash".
19. Label all simulated data (bills, worker GPS, predictive alerts, AI scores, QR) clearly in the UI.
20. Run `npm audit fix`, fix the 20 lint errors (hooks), delete dead code, and add CI (lint, typecheck, tests).

### Phase 3 — Repo hygiene
21. `git rm -r --cached dist-web static-build zipFile.zip attached_assets/*.zip`; consider `git filter-repo` to shrink history.
22. Merge the docs into one `README` + one `DEPLOYMENT.md`; fix `.env.example`; resolve the MIT vs "All Rights Reserved" conflict.
23. Compile the portals' JSX at build time (Vite) instead of using `@babel/standalone`; pin versions and add SRI.

---

## Appendix A — Reproduction log (local instance, localhost:5055)

```
1) POST /api/auth/login {9999999999, 000000}                → role: super_admin
4) PUT /api/complaints/<other user's id>/resolve ×3 (citizen) → resolved ×3, points 0 → 15
5) POST /api/dept/login {police, police_2026}               → token issued
   HMAC("sankalp-dept-secret-2026") forged dept token       → accepted
6) GET /api/cpr/leaderboard (no auth)                       → "SI Priya Rana 9412012002"
7) GET /api/departments (no auth)                           → 401 (public handler shadowed)
8) POST /api/upload/audio with ~147 KB JSON                 → 413 Payload Too Large
9) POST /api/upload {filename:"x.html", <script>…}          → served as text/html on app origin
10) 15× bad login with rotating X-Forwarded-For             → 15× 401, never 429
11) Dehradun citizen WS ← Haridwar women-safety SOS         → "Victim 7000000002 {lat:29.95,lng:78.16}"
12) curl -N /api/cpr/stream (no auth)                       → full SOS payload incl. phone + GPS
13) Citizen GET /api/complaints → assignedWorkerPin 888733
    PUT /api/complaints/:id/proof (no auth) with that PIN    → status: resolved
```

## Appendix B — Tooling results
* `npx tsc --noEmit`: 14 errors, all in `server/replit_integrations/**` (dead code).
* `npx expo lint`: 146 problems (20 errors / 126 warnings).
* `npm audit --omit=dev`: 44 vulnerabilities (2 critical, 22 high, 18 moderate, 2 low).
* Secret scan (tree + full git history): no live credentials found.

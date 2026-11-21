# SANKALP AI — CLAUDE CODE MASTER PROMPT (ALL PHASES · MAJOR + MINOR · ZERO-ERROR GATES)

> Saved verbatim-in-substance from the human's instruction of 2026-11-21. This is the canonical plan.
> To resume: "Continue from PROGRESS.md using CLAUDE.md and docs/MASTER_PROMPT.md."

## 0. MISSION
Sankalp AI is an AI-first civic operating system for India. Citizens report civic problems and women-safety SOS; AI routes to the right government department; officers resolve with photo proof; **a case closes only when the citizen confirms the fix.** Started in Uttarakhand; must become ready for any Indian state by configuration: sovereign (data stays in India), secure, honest, accessible, works on low-end phones and weak networks.
Complete every phase (0 → 8), fixing every MAJOR and MINOR item with zero errors at every gate. Work autonomously; use the safe defaults in §11 and record each decision in `DECISIONS.md`.

## 1. FIRST ACTIONS
1. `git status` — stop if dirty.
2. Branch `upgrade/india-ready` (see DECISIONS D-001); one commit per task, `[P<phase>.<task>] <what changed>`.
3. Save this prompt as `docs/MASTER_PROMPT.md`.
4. Create `CLAUDE.md` (Appendix C).
5. `PROGRESS.md` with every task ID from §4–6 as `[ ]`; update after each task (`[x]` + hash, or `[!]` + blocker).
6. Todo list mirroring current phase.
7. Baseline: install deps; `npx tsc --noEmit`, `npx eslint .`, tests, `npm audit --omit=dev`; check server starts → `docs/BASELINE.md`.
8. Read-only inventories: (a) all API routes → `docs/ROUTES.md` (method, path, auth, role, body); (b) every outbound network call in server/, app/, lib/, server/web/ → `docs/EGRESS_BASELINE.md`; (c) complaint, SOS, worker data flows → `docs/DATA_MODEL_CURRENT.md`.

## 2. VERIFIED FACTS (confirm, then act)
- App: Expo/React Native; screens in `app/(tabs)/` (16), `app/(auth)/`, `app/admin/` (11).
- Server: Express + TS; `server/routes.ts` ~2,140 lines ~102 routes; `server/storage.ts` ~1,720 lines; `server/index.ts` CORS + static.
- Portals: `server/web/` (portal, dept, cpr, pcr, public, rti, video).
- Data: all in-memory in storage.ts; Drizzle/pg installed but `shared/schema.ts` only has `users`.
- AI chain: OpenAI gpt-4o-mini → Groq → NVIDIA → rules; vision gpt-4o-mini + NVIDIA llama-3.2-11b-vision; `server/replit_integrations/*` use OpenAI.
- Departments: pwd, ulb, jal, upcl, forest, health, usdma, police. 14 complaint categories, 10 SOS categories. SLA `{P1:24,P2:48,P3:72,P4:168}`. Anomalies: cluster/spike/sla_breach/hotspot. `rejectResolution` reopens after 3 rejections. SOS triggers: 6 taps in 3 s, press-hold, shake, volume-up, power button.
- Preserve: all 5 SOS triggers, 4 anomaly rules, SLA values (configurable per tenant), 3-rejection reopen rule, Hindi + English UI.

## 3. NON-NEGOTIABLE RULES
1. Data stays in India: all outbound HTTP through one `safeFetch()` that checks `EGRESS_ALLOWLIST`; other hosts throw. No OpenAI/Groq/NVIDIA/foreign AI on production paths. Text AI = Sarvam (`api.sarvam.ai`) or self-hosted on an Indian GPU; vision = self-hosted. If neither configured → rules engine + manual review. Never fall back to foreign API.
2. No personal data in notifications, WhatsApp, SMS, logs ("Complaint #ID updated — open the app").
3. No fake data. Simulations only behind `DEMO_MODE=true` with visible "DEMO" badge. Every dashboard number computed from stored records, formula + n documented.
4. Proof before closure: valid proof photo AND citizen confirmation (or documented, labelled auto-close rule).
5. Fail closed: AI/verification failure → `manual_review`, never auto-approve.
6. Least privilege: every route auth (unless explicitly public) + role permission + tenant scope.
7. Citizens never pay; never sell/share citizen data; government client owns data, Sankalp is processor (DPDP Act 2023).
8. Political neutrality: no voter profiling, contact export, bulk political messaging.
9. SOS is sacred: no paywall, login wall or rate limit blocks a genuine SOS; de-duplicate instead.
10. No secrets in code/git/logs/chat; list found ones in `SECRETS_TO_ROTATE.md` (names + locations only).
11. Backwards compatible: keep existing API working or add `/api/v2` and update all callers in the same task.
12. Honest reporting: never claim done/tested without running it; say what can't be tested here.

## 4. MAJOR ISSUES (fix all)
| ID | Location | Problem | Fix & acceptance |
|---|---|---|---|
| M1 | routes.ts ~L28 | Worker GPS simulated with Math.random every 8 s | Simulate only with DEMO_MODE + badge; real `POST /api/worker/location` (auth worker), stored, SSE streamed. Test: DEMO_MODE off → positions only change on real post. |
| M2 | /api/upload, /api/upload/audio, index.ts ~L282 | Extension from user input, no content check/size limit, public → stored XSS | Allow-list ext + magic bytes; 8 MB images / 15 MB audio; server UUID names; nosniff; Content-Disposition for non-images. Test: .html upload and fake JPEG rejected. |
| M3 | same | SOS audio public | Private storage via authenticated route (owner, assigned police, district admin), each access audited. Test: anonymous → 401. |
| M4 | ~L1462 | Photo authenticity fails open (isReal:true) | Return `manual_review` + create review task. Test AI-down path. |
| M5 | ~L1573, ~L1606 | Default DEPT_JWT_SECRET; dept code `${id}_2026` | Refuse boot if JWT_SECRET/DEPT_JWT_SECRET missing or <32 chars; random bcrypt-hashed rotatable dept codes. Test: pwd_2026 fails. |
| M6 | README | Admin credentials published | Remove; add to SECRETS_TO_ROTATE.md. |
| M7 | resolveComplaint, submitComplaintProof | Resolution without proof/citizen confirmation | Explicit state machine (§7.1), reject illegal transitions; unit tests for every transition, 3-rejection reopen, escalation. |
| M8 | storage.ts | Memory only | Phase 0: atomic JSON snapshot (temp+rename) every 30 s + SIGTERM, reload on boot; Phase 1 Postgres. Test: restart keeps complaints. |
| M9 | PREDICTIONS, /api/predictive | Hard-coded fake percentages | Delete; return computed signals (counts, WoW %, cluster size, n, method); `insufficient_data` when thin. Test: no literal % strings. |
| M10 | AI call sites, replit_integrations | Citizen data to foreign AI | `server/ai/gateway.ts` (chat, vision, stt, tts); providers by env; foreign removed; all call sites use gateway; egress audit passes. |
| M11 | index.ts ~L303 | node_modules served statically | Remove; serve only built assets. |
| M12 | index.ts CORS | *.replit.dev allowed with credentials; no-origin gets * | Origins only from CORS_ORIGINS; credentials only for listed origins; no replit wildcard in prod. |
| M13 | AuthContext | Token in AsyncStorage; demo-token login | expo-secure-store on native (web fallback); demo login only with DEMO_MODE. |
| M14 | whole server | No rate limiting, helmet, validation | helmet; express-rate-limit on auth/OTP/upload/AI (SOS exempt, de-duplicated); zod on every route; route-inventory test fails if any route lacks validation or permission declaration. |
| M15 | legacy PINs | plaintext | Re-hash on next login, delete plaintext, migration script. |
| M16 | server/web/*.html | unpkg libs; OSM tiles | Vendor into server/web/vendor/ pinned; tiles from MAP_TILE_URL (OSM dev only); escape all user text before DOM insertion. |
| M17 | push notifications | Content via foreign servers | Payload only `{title:"Sankalp", body:"Update on #ID", data:{id}}`; details fetched from API. |
| M18 | react-native-maps | Google Maps on Android | Abstract map component; configurable provider (Leaflet/OSM WebView or Indian SDK); DECISIONS.md. |
| M19 | zero tests | — | Vitest + Supertest API, Jest/RTL app components; ≥70% coverage on server business logic by end of Phase 1. |

## 5. MINOR ISSUES (fix all)
| ID | Problem | Fix |
|---|---|---|
| m1 | err.message to clients | Central error handler `{code,message}`; details logged server-side. |
| m2 | 31 `: any` in routes.ts | Proper / zod-inferred types; noImplicitAny on. |
| m3 | Hard-coded `https://sankalp-ai.replit.app` in lib/sosheatmap-html.ts, lib/workermap-html.ts, app/admin/workermap.web.tsx | From config (EXPO_PUBLIC_API_URL / PUBLIC_BASE_URL). |
| m4 | IDs/filenames from Math.random | crypto.randomUUID(). |
| m5 | 2,140-line routes.ts | Split into server/routes/<domain>.ts; behaviour unchanged, proven by tests. |
| m6 | console.log PII | pino with redaction (phone, name, address, GPS, tokens). |
| m7 | Committed build/junk (zipFile.zip, dist-web/, attached_assets/, static-build/) | Untrack zipFile.zip + dist-web/, .gitignore; static-build generated at deploy then untracked; check attached_assets refs; no history rewrite without asking. |
| m8 | Overlapping docs | Merge into docs/DEPLOYMENT.md + docs/MOBILE_BUILD.md. |
| m9 | SLA timers local time | Store UTC; business rules in Asia/Kolkata; tests across midnight. |
| m10 | Lists return everything | Cursor pagination (default 50, max 200). |
| m11 | SSE/WS | Heartbeat 25 s, client reconnect with backoff, WS auth, per-user connection limits. |
| m12 | setInterval jobs in routes | server/jobs/ with start/stop, graceful shutdown, no duplicate timers. |
| m13 | No env validation | server/config.ts zod validation at boot, fail fast. |
| m14 | App UX states | Error boundary; loading/empty/offline states; retry. |
| m15 | Accessibility | accessibilityLabel, ≥44 px targets, font scaling, contrast ≥4.5:1. |
| m16 | Large photos | Compress/resize on device (max 1600 px, ~0.7). |
| m17 | Indian input | Validate +91 mobile, pincodes; normalise E.164. |
| m18 | Dependency hygiene | Remove unused deps, fix high/critical audit, pin versions. |
| m19 | API docs | OpenAPI from zod → docs/openapi.json. |
| m20 | Repo hygiene | SECURITY.md, DATA_RESIDENCY.md, CONTRIBUTING.md, CHANGELOG.md; verify LICENSE/credits; .env.example names only. |

## 6. PHASES (in order; each ends with the §8 gate)
### PHASE 0 — Demo-safe hardening
M1–M17 (M8 as snapshot), m1, m3, m4, m13, plus:
- P0.a `npm run seed:demo` — realistic demo data `is_demo=true`, one-command reset.
- P0.b `DEMO.md` — exact click path: complaint+photo → AI routing → dept portal → proof photo → citizen verify → closed → public dashboard; SOS (6 taps) → police CPR portal; recovery section.
- P0.c `scripts/smoke.ts` — whole demo path via API, exits non-zero on failure.

### PHASE 1 — Production foundation
1. PostgreSQL schema (Drizzle): tenants, users, roles, departments, categories, complaints, complaint_events, media, proofs, verifications, sos_events, sos_contacts, workers, worker_locations, police_stations, announcements, rti_requests, consents, audit_log, review_tasks; indexes (tenant_id,status), (tenant_id,created_at), geo, (department_id,status).
2. Repository layer implementing the storage interface on Postgres; `STORAGE_DRIVER=postgres|snapshot`; snapshot→Postgres migration script.
3. Multi-tenancy: tenant_id on every row, scoped query helper, test tenant A cannot read B.
4. RBAC roles citizen, worker, officer, dept_admin, district_admin, police, state_admin, super_admin; permission map server/auth/permissions.ts; middleware on every route.
5. Auth: phone OTP via Indian DLT SMS (interface + console driver); access 15 min + refresh 30 d with rotation; logout revokes refresh.
6. Media: India-region S3-compatible (interface + local driver), private buckets, 5-min signed URLs, EXIF private, public copies stripped.
7. Hash-chained audit log `sha256(prev_hash + canonical_json(entry))` + `npm run audit:verify`.
8. Tenant config `config/tenants/uttarakhand.json` (departments, category→dept, SLA, languages, helplines, map bounds, police stations); remove hard-coded Uttarakhand values.
9. DPDP: consent screen (Hindi/English, versioned, stored), privacy notice, access/erasure requests (legal-hold exception for police cases), retention + purge job, grievance officer contact.
10. Observability: pino with redaction, request IDs, /healthz, /readyz, downtime alert hook; no foreign logging SaaS.
11. CI (GitHub Actions): typecheck, lint, test, npm audit, gitleaks, egress audit.
12. Backups: scripts/backup.sh (encrypted pg_dump to India storage), restore drill in docs/OPERATIONS.md.
13. m2, m5, m6, m7, m8, m9, m10, m11, m12, m18, m19, m20.

### PHASE 2 — Sovereign AI layer
1. gateway.ts OpenAI-compatible client: 8 s timeout, 1 retry, circuit breaker, per-call metrics.
2. Providers: sarvam (sarvam-105b; STT/TTS via Sarvam), selfhosted (vLLM at AI_TEXT_BASE_URL / AI_VISION_BASE_URL), rules.
3. PII masking before every model call (phone, 12-digit Aadhaar-like, email, address), tests Hindi + English.
4. Versioned prompts server/ai/prompts/*.ts: classify, summarize, reply_citizen, officer_brief; zod-validated JSON; invalid → rules.
5. Eval: eval/complaints.jsonl ≥300 hand-written labelled examples (Hindi, English, Hinglish, Garhwali/Kumaoni Devanagari); `npm run eval` accuracy, confusion matrix, p95; CI fails on >2-pt drop.
6. Explainability: store model, prompt_version, input_hash, output, confidence; one-line reason in officer portal.
7. Egress enforcement: safeFetch, allowlist test, scripts/egress-audit.ts static scan.

### PHASE 3 — Proof-of-Fix 2.0 (server/verification/)
1. Geo check within PROOF_RADIUS_M (50 m); worker app camera-only for proof.
2. Reuse check: pHash vs tenant media, Hamming ≤ 8 flagged.
3. Same scene: ORB matching or self-hosted embeddings.
4. Change check: category-specific vision question → `{fixed, confidence}`.
5. Citizen confirmation: in-app Yes/No; voice callback (Indian telephony interface + mock, Sarvam TTS, press 1/2); SMS fallback.
6. Optional neighbour confirmation (2–3 opted-in users within 200 m).
7. Decision engine: weighted score → VERIFIED / NEEDS_REVIEW / REJECTED (weights in tenant config); all signals stored+audited; reviewer queue UI in dept portal.
8. Real Resolution Rate per dept/ward = citizen-verified ÷ closed, Wilson 95% CI + n, beside official rate; unit-test Wilson.

### PHASE 4 — Agentic workflows (server/agents/, human in the loop)
1. Duplicate merge (same category, ≤100 m, ≤7 d, text similarity) → parent ticket, "N citizens affected", priority rises with N, human unmerge.
2. SLA escalation 75% officer / 100% dept head / 150% district admin; audited; snooze with reason.
3. Workload balancer suggests assignee (load, distance, skill); officer confirms.
4. Weekly district briefing from real data with sources; PDF export.
5. Real trend signals: seasonal week-of-year baselines, only with enough n, uncertainty shown.
6. Hard limit: agents remind/suggest/summarise/escalate; never close/reject/delete/merge without reversible audit entry; never close or reject at all.

### PHASE 5 — Reach every Indian
1. Offline-first queue (SQLite/AsyncStorage), background sync, conflict-safe IDs, "Saved — will send when online".
2. Basic-phone channels (interfaces+mocks+docs): SMS keyword format; missed call → IVR → STT → AI → ticket; SMS status.
3. WhatsApp citizen-initiated file/track (Cloud API interface), no PII in templates.
4. i18n: strings in locales/; Hindi + English complete; Garhwali + Kumaoni Devanagari; 22 scheduled languages scaffolded via Sarvam Translate, `needs_review`.
5. Voice-first complaint: mic → STT → editable text.
6. Performance: cold start <4 s low-end profile, APK size report, 2G throttling tests.
7. Accessibility: WCAG 2.1 AA for portals (axe), m14–m17.

### PHASE 6 — Safety and disaster
1. SOS: keep 5 triggers; SMS fallback with location offline; cancel window with PIN (5 s); retry with backoff + delivery receipt per contact; server de-dup.
2. Evidence vault AES-256-GCM (keys from env/KMS in India); owner, assigned police, district admin only; every view audited.
3. Fake incoming call; check-in timer alerts trusted contacts.
4. Police routing to nearest station from tenant list; docs/112_INTEGRATION_PLAN.md (no live integration without approval).
5. Disaster mode (tenant toggle, disaster-authority role): road-block/landslide reports, area broadcasts, relief camps, missing persons, low-bandwidth UI.
6. Yatra/tourist mode: opt-in group tracking, lost-member alert, nearest medical point, helplines, auto-expiry.

### PHASE 7 — India-wide scale and deployment
1. Tenant onboarding wizard + CSV import (departments, wards, police stations), zod-validated tenant config.
2. docker-compose.yml (api, postgres, worker, optional vLLM) + Helm chart; docs/DEPLOYMENT.md for MeitY-empanelled cloud and on-prem State Data Centre one-command install.
3. k6 load test: 50k complaints/day, 500 concurrent officers, SSE fan-out; p95 < 300 ms.
4. DR: backup to second Indian region; documented, tested RPO/RTO.
5. Security: OWASP ASVS L2 self-assessment docs/ASVS.md; fix high/critical; CERT-In audit pack.

### PHASE 8 — Transparency and integrations
1. Public dashboard (no login, no PII): ward + dept performance, Real Resolution Rate with CI, SLA compliance; CSV open data with k-anonymity (<5 suppressed).
2. Integration adapters (interface + mapping docs) for CM helplines / grievance portals.
3. Embeddable widgets ("Report an issue", "Ward score").
4. Final docs: README (no credentials), docs/ARCHITECTURE.md with diagram, DATA_RESIDENCY.md, SECURITY.md, OPERATIONS.md, CHANGELOG.md.

## 7. REFERENCE DESIGNS
### 7.1 Complaint state machine
```
NEW → ASSIGNED → IN_PROGRESS → PROOF_SUBMITTED → VERIFYING
VERIFYING → CITIZEN_VERIFIED → CLOSED
VERIFYING → NEEDS_REVIEW → (reviewer) CITIZEN_VERIFIED | REOPENED
VERIFYING → REJECTED_BY_CITIZEN → REOPENED (count++); count ≥ 3 → ESCALATED
PROOF_SUBMITTED + no citizen response 7 days + all automatic checks pass → AUTO_CLOSED_UNVERIFIED (separate, excluded from RRR numerator)
Any → CANCELLED_BY_CITIZEN (only before ASSIGNED)
```
### 7.2 Real Resolution Rate (Wilson)
```
p = verified / closed, n = closed, z = 1.96
center = (p + z²/(2n)) / (1 + z²/n)
margin = z * sqrt(p(1−p)/n + z²/(4n²)) / (1 + z²/n)
CI = [center − margin, center + margin]  ("insufficient data" if n < 10)
```
### 7.3 Folder layout target
```
server/ config.ts index.ts routes/ auth/ db/ ai/ (gateway, providers/, prompts/, pii.ts) verification/ agents/ jobs/ notify/ lib/ (safeFetch, logger, errors, geo, time) web/ (portals + vendor/)
config/tenants/*.json  eval/  scripts/  docs/  tests/
```

## 8. ZERO-ERROR GATE (every task; full run every phase)
| Check | Command | Must be |
|---|---|---|
| Types | npm run typecheck | 0 errors |
| Lint | npm run lint | 0 errors |
| Tests | npm test | 100% pass |
| Server boots | npm run server + GET /healthz | 200 |
| Smoke | npm run smoke | exit 0 |
| Web build | npx expo export --platform web | succeeds |
| Egress | npm run egress:audit | only allowlisted Indian hosts |
| Secrets | gitleaks or equivalent | 0 findings in new commits |
| Deps | npm audit --omit=dev | 0 high/critical or each justified in DECISIONS.md |
Never disable tests, add @ts-ignore, or loosen lint rules. Out-of-scope baseline failures recorded in PROGRESS.md. End of each phase: fresh review subagent reviews the diff against §3–6; fix confirmed issues; rerun gate; update PROGRESS.md; commit; write docs/reports/phase-<n>.md (§9).

## 9. PHASE REPORT FORMAT
Summary (5 lines) · Tasks done (ID → hash → line) · Gate results · Egress audit hosts · Review findings + fixes · Not done / not testable · Secrets to rotate · Decisions.

## 10. NEVER DO
Never send PII to non-allowlisted hosts or add foreign analytics/error SDKs; never invent statistics or leave simulations unlabelled; never let AI close/reject/delete; never block or rate-limit SOS; never commit .env, keys, real citizen data or real phone numbers (use +91 90000 0000x placeholders); never force-push/rewrite history/delete branches without asking; never build voter profiling, contact export or bulk political messaging; never mark a task done without the gate.

## 11. SAFE DEFAULTS
| Decision | Default |
|---|---|
| Text AI | sarvam if SARVAM_API_KEY; else selfhosted if AI_TEXT_BASE_URL; else rules |
| Vision AI | selfhosted if AI_VISION_BASE_URL; else manual_review |
| SMS/voice/WhatsApp/push | interface + console/mock driver |
| Storage | local in dev; S3-compatible in prod via env |
| Map tiles | MAP_TILE_URL; OSM only in development |
| Auto-close | disabled; tenant may enable 7-day AUTO_CLOSED_UNVERIFIED |
| Demo mode | off; on via DEMO_MODE=true with badge |
| Retention | complaints 3 y; media 1 y after closure; SOS evidence 1 y unless legal hold ("needs legal confirmation") |

## APPENDIX A — .env.example (names only)
NODE_ENV, PORT, PUBLIC_BASE_URL, CORS_ORIGINS, DEMO_MODE, DATABASE_URL, STORAGE_DRIVER, JWT_SECRET, DEPT_JWT_SECRET, EGRESS_ALLOWLIST, AI_TEXT_PROVIDER, SARVAM_API_KEY, SARVAM_MODEL, AI_TEXT_BASE_URL, AI_TEXT_MODEL, AI_VISION_BASE_URL, AI_VISION_MODEL, MEDIA_DRIVER, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, EVIDENCE_ENC_KEY, MAP_TILE_URL, SMS_DRIVER, SMS_API_KEY, SMS_SENDER_ID, DLT_ENTITY_ID, VOICE_DRIVER, VOICE_API_KEY, WHATSAPP_DRIVER, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN, PROOF_RADIUS_M, EXPO_PUBLIC_API_URL.

## APPENDIX B — Pitch-safe claims (only after the matching gate passes)
| Claim | Unlocked by |
|---|---|
| "A case closes only when the citizen confirms the fix." | M7 |
| "No fake numbers on our dashboards." | M1 + M9 |
| "Citizen data never leaves India; our AI runs on Indian models." | M10 + M16 + M17 + egress audit green |
| "Multi-signal proof-of-fix with a Real Resolution Rate." | Phase 3 |
| "Works on basic phones and offline in the hills." | Phase 5 |
| "Any Indian state can go live by configuration." | Phase 1.8 + Phase 7.1 |

## APPENDIX C — CLAUDE.md content
See `/CLAUDE.md`.

# PROGRESS — Sankalp AI upgrade

Legend: `[ ]` todo · `[x]` done (commit) · `[~]` partial · `[!]` blocked (reason). Branch: `claude/sleepy-turing-n6wo0u` (DECISIONS D-001).

## Section 1 — First actions
- [x] S1.1 git status clean — (this commit)
- [x] S1.2 branch + commit convention — (this commit)
- [x] S1.3 docs/MASTER_PROMPT.md — (this commit)
- [x] S1.4 CLAUDE.md — (this commit)
- [x] S1.5 PROGRESS.md — (this commit)
- [x] S1.6 todo list — (this commit)
- [x] S1.7 docs/BASELINE.md — (this commit)
- [x] S1.8a docs/ROUTES.md — (this commit)
- [x] S1.8b docs/EGRESS_BASELINE.md — (this commit)
- [x] S1.8c docs/DATA_MODEL_CURRENT.md — (this commit)

## Phase 0 — Demo-safe hardening
- [x] M1 worker GPS demo-only + real location API — f724a4b
- [x] M2 upload allow-list, magic bytes, size limits, nosniff — f724a4b
- [x] M3 private SOS audio + audited access — f724a4b
- [x] M4 photo authenticity fails closed → manual_review — f724a4b
- [x] M5 required secrets, random hashed dept codes — f724a4b
- [x] M6 remove published credentials — 86bac98
- [x] M7 complaint state machine — f724a4b
- [x] M8 JSON snapshot persistence — f724a4b
- [x] M9 remove fake predictions — f724a4b
- [x] M10 AI gateway, foreign AI removed — f724a4b
- [x] M11 stop serving node_modules — f724a4b
- [x] M12 CORS allow-list — f724a4b
- [x] M13 secure token storage, demo login gated — a42a088
- [x] M14 helmet, rate limits, zod on every route, route inventory test — f724a4b
- [x] M15 re-hash legacy PINs + migration — 86bac98
- [x] M16 vendor portal libs, MAP_TILE_URL, escaping — 86bac98
- [x] M17 PII-free push payloads — f724a4b
- [x] m1 central error handler — f724a4b
- [x] m3 configurable base URL — 86bac98
- [x] m4 randomUUID ids — f724a4b
- [x] m13 env validation — f724a4b
- [x] P0.a seed:demo — 86bac98
- [x] P0.b DEMO.md — 86bac98
- [x] P0.c scripts/smoke.ts — 86bac98
- [x] P0.gate Phase 0 gate + review + report — docs/reports/phase-0.md

## Phase 1 — Production foundation
- [x] P1.1 Postgres schema — b9c6cc4
- [x] P1.2 repository layer + driver switch + migration — b9c6cc4
- [x] P1.3 multi-tenancy — 900d3e7
- [x] P1.4 RBAC — 7a6c727
- [x] P1.5 OTP + access/refresh tokens — 7a6c727
- [x] P1.6 media storage — 5ee1a90
- [x] P1.7 hash-chained audit log — 5ee1a90
- [x] P1.8 tenant config — 900d3e7
- [x] P1.9 DPDP features — e8da616
- [x] P1.10 observability — e8da616
- [x] P1.11 CI — (phase-1 minors commit)
- [x] P1.12 backups — (phase-1 minors commit)
- [x] M18 map abstraction — (phase-1 minors commit) — react-native-maps removed; all maps are Leaflet WebViews with MAP_TILE_URL
- [x] M19 test suite ≥70% coverage — (phase-1 minors commit) — 135 tests, server coverage 72.5% lines / 77% branches, CI threshold 70%
- [x] m2 remove any — no `any` left in server/
- [x] m5 split routes — routes split into server/routes/*.ts (f724a4b)
- [x] m6 pino redaction — e8da616 pino with redaction
- [x] m7 untrack build junk — attached_assets untracked; static-build kept (D-026)
- [x] m8 merge docs — docs/DEPLOYMENT.md + docs/MOBILE_BUILD.md
- [x] m9 UTC/IST — server/lib/time.ts + IST midnight tests
- [x] m10 pagination — /api/v2 cursor pagination (D-027)
- [x] m11 SSE/WS heartbeat+limits — SSE per-principal limit 3, heartbeat, WS backoff
- [x] m12 jobs module — server/jobs/ start/stop, per tenant
- [x] m18 dependency hygiene — unused deps removed, deps:audit allow-list
- [x] m19 OpenAPI — docs/openapi.json generated from zod (131 paths)
- [~] m20 repo docs — SECURITY/DATA_RESIDENCY/CONTRIBUTING/CHANGELOG/.env.example done; LICENSE conflict needs owner (D-019)
- [x] P1.gate — gate green; independent review: C1, C2, H1–H4, M1–M7, L1–L4 fixed with regression tests (docs/reports/phase-1.md)

## Phase 2 — Sovereign AI
- [x] P2.1 gateway resilience — circuit breaker, 8 s timeout, 1 retry, metrics
- [x] P2.2 providers — sarvam | selfhosted | rules; vision self-hosted only
- [x] P2.3 PII masking — phone/Aadhaar/e-mail/address, English + Devanagari
- [x] P2.4 versioned prompts — server/ai/prompts with zod output schemas
- [x] P2.5 eval set + npm run eval — eval/ set, rules baseline 78.2%
- [x] P2.6 explainability — aiDecisions on complaints; routing reason in dept portal
- [x] P2.7 egress enforcement — every model call via safeFetch; self-hosted host must be explicitly allow-listed
- [x] P2.gate — gate green; review findings 1–11 fixed (docs/reports/phase-2.md)

## Phase 3 — Proof-of-Fix 2.0
- [x] P3.1 geo check — EXIF GPS + device GPS vs complaint, 50 m (tenant proofRadiusM); app proof is camera-only + sends GPS
- [x] P3.2 pHash reuse — 64-bit DCT pHash at upload, Hamming ≤ 8 vs all tenant media → flag
- [x] P3.3 same scene — periphery (background) hash before vs after; ORB/embeddings not available without a self-hosted model
- [x] P3.4 change check — category question to self-hosted vision only; unknown otherwise
- [x] P3.5 citizen confirmation channels — in-app, SMS reminder + inbound webhook, IVR voice callback (Sarvam TTS) with signed token
- [x] P3.6 neighbour confirmation — up to 3 opted-in nearby users; identities never exposed
- [x] P3.7 decision engine + reviewer queue — weighted, unknown ≠ pass, tenant weights; dept portal Proof Review page
- [x] P3.8 Real Resolution Rate (Wilson) — GET /api/public/resolution-rate, Wilson 95% CI + n beside official rate
- [x] P3.gate — gate green; review findings 1–7 fixed (docs/reports/phase-3.md)

## Phase 4 — Agentic workflows
- [ ] P4.1 duplicate merge
- [ ] P4.2 SLA escalation
- [ ] P4.3 workload balancer
- [ ] P4.4 weekly briefing
- [ ] P4.5 trend signals
- [ ] P4.6 agent hard limits
- [ ] P4.gate

## Phase 5 — Reach every Indian
- [ ] P5.1 offline queue
- [ ] P5.2 basic-phone channels
- [ ] P5.3 WhatsApp
- [ ] P5.4 i18n
- [ ] P5.5 voice complaint
- [ ] P5.6 performance
- [ ] P5.7 accessibility + m14–m17
- [ ] P5.gate

## Phase 6 — Safety and disaster
- [ ] P6.1 SOS fallback/cancel/retry/dedup
- [ ] P6.2 evidence vault
- [ ] P6.3 fake call + check-in
- [ ] P6.4 police routing + 112 plan
- [ ] P6.5 disaster mode
- [ ] P6.6 yatra mode
- [ ] P6.gate

## Phase 7 — Scale & deployment
- [ ] P7.1 tenant onboarding
- [ ] P7.2 docker-compose + Helm + deployment docs
- [ ] P7.3 k6 load test
- [ ] P7.4 DR
- [ ] P7.5 ASVS L2
- [ ] P7.gate

## Phase 8 — Transparency
- [ ] P8.1 public dashboard + open data
- [ ] P8.2 integration adapters
- [ ] P8.3 widgets
- [ ] P8.4 final docs
- [ ] P8.gate

## Baseline failures out of scope
See docs/BASELINE.md.

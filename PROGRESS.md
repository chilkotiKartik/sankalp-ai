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
- [ ] P0.gate Phase 0 gate + review + report

## Phase 1 — Production foundation
- [ ] P1.1 Postgres schema
- [ ] P1.2 repository layer + driver switch + migration
- [ ] P1.3 multi-tenancy
- [ ] P1.4 RBAC
- [ ] P1.5 OTP + access/refresh tokens
- [ ] P1.6 media storage
- [ ] P1.7 hash-chained audit log
- [ ] P1.8 tenant config
- [ ] P1.9 DPDP features
- [ ] P1.10 observability
- [ ] P1.11 CI
- [ ] P1.12 backups
- [ ] M18 map abstraction
- [~] M19 test suite ≥70% coverage — Vitest+Supertest suite (79 tests); coverage target pending
- [ ] m2 remove any
- [x] m5 split routes — routes split into server/routes/*.ts (f724a4b)
- [ ] m6 pino redaction
- [~] m7 untrack build junk — dist-web/ + zipFile.zip untracked (86bac98); static-build regenerated; attached_assets pending
- [x] m8 merge docs — docs/DEPLOYMENT.md + docs/MOBILE_BUILD.md
- [ ] m9 UTC/IST
- [ ] m10 pagination
- [~] m11 SSE/WS heartbeat+limits — 25 s heartbeat, WS auth, 5 sockets/user, client backoff (f724a4b, a42a088); per-user SSE limits pending
- [~] m12 jobs module — server/jobs/ with start/stop (f724a4b); graceful shutdown done
- [~] m18 dependency hygiene — unused deps removed, audit 0 critical / 1 justified high (D-016)
- [ ] m19 OpenAPI
- [~] m20 repo docs — SECURITY/DATA_RESIDENCY/CONTRIBUTING/CHANGELOG/.env.example done; LICENSE conflict needs owner (D-019)
- [ ] P1.gate

## Phase 2 — Sovereign AI
- [ ] P2.1 gateway resilience
- [ ] P2.2 providers
- [ ] P2.3 PII masking
- [ ] P2.4 versioned prompts
- [ ] P2.5 eval set + npm run eval
- [ ] P2.6 explainability
- [ ] P2.7 egress enforcement
- [ ] P2.gate

## Phase 3 — Proof-of-Fix 2.0
- [ ] P3.1 geo check
- [ ] P3.2 pHash reuse
- [ ] P3.3 same scene
- [ ] P3.4 change check
- [ ] P3.5 citizen confirmation channels
- [ ] P3.6 neighbour confirmation
- [ ] P3.7 decision engine + reviewer queue
- [ ] P3.8 Real Resolution Rate (Wilson)
- [ ] P3.gate

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

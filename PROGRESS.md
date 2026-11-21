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
- [ ] M1 worker GPS demo-only + real location API
- [ ] M2 upload allow-list, magic bytes, size limits, nosniff
- [ ] M3 private SOS audio + audited access
- [ ] M4 photo authenticity fails closed → manual_review
- [ ] M5 required secrets, random hashed dept codes
- [ ] M6 remove published credentials
- [ ] M7 complaint state machine
- [ ] M8 JSON snapshot persistence
- [ ] M9 remove fake predictions
- [ ] M10 AI gateway, foreign AI removed
- [ ] M11 stop serving node_modules
- [ ] M12 CORS allow-list
- [ ] M13 secure token storage, demo login gated
- [ ] M14 helmet, rate limits, zod on every route, route inventory test
- [ ] M15 re-hash legacy PINs + migration
- [ ] M16 vendor portal libs, MAP_TILE_URL, escaping
- [ ] M17 PII-free push payloads
- [ ] m1 central error handler
- [ ] m3 configurable base URL
- [ ] m4 randomUUID ids
- [ ] m13 env validation
- [ ] P0.a seed:demo
- [ ] P0.b DEMO.md
- [ ] P0.c scripts/smoke.ts
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
- [ ] M19 test suite ≥70% coverage
- [ ] m2 remove any
- [ ] m5 split routes
- [ ] m6 pino redaction
- [ ] m7 untrack build junk
- [ ] m8 merge docs
- [ ] m9 UTC/IST
- [ ] m10 pagination
- [ ] m11 SSE/WS heartbeat+limits
- [ ] m12 jobs module
- [ ] m18 dependency hygiene
- [ ] m19 OpenAPI
- [ ] m20 repo docs
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

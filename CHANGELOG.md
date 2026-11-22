# Changelog

## [Unreleased] — Phases 1–8 (2026-11-21 … 2026-11-22)
Each phase was followed by an independent review; every confirmed finding was fixed with a regression test (`docs/reports/phase-1.md` … `phase-8.md`).
### Phase 1 — Production foundation
Optional Postgres driver (Drizzle, PGlite tests), multi-tenancy, 9-role RBAC, OTP + rotating refresh tokens, private media with signed URLs, hash-chained audit log, DPDP consent/export/erasure/retention, structured logs + readiness alerts, CI, encrypted backups.
### Phase 2 — Sovereign AI
AI gateway (Sarvam / self-hosted / rules) with circuit breaker, deadlines and metrics; PII masking with a last guard; versioned prompts; eval with a held-out set in CI; explainable routing.
### Phase 3 — Proof-of-Fix 2.0
Geo, pHash reuse, scene, vision and citizen/neighbour signals → decision engine (unknown ≠ pass); SMS/voice confirmation; reviewer queue; Real Resolution Rate with Wilson intervals.
### Phase 4 — Agents (human in the loop)
Reversible duplicate linking, SLA escalation ladder with capped snooze, workload suggestions, weekly briefing (PDF), seasonal trends; static test that agents never close or reject.
### Phase 5 — Reach
Offline outbox (per user, idempotent), SMS keywords, missed call → IVR → STT, WhatsApp interface, i18n (en/hi, Garhwali/Kumaoni drafts), voice-first complaints (browser Web Speech removed), gzip + server-compiled portals, WCAG 2.1 AA portals.
### Phase 6 — Safety and disaster
Trusted contacts with signed live-location links, PIN/OTP cancel, AES-256-GCM evidence vault with key rotation, check-ins, fake call, offline SMS fallback, disaster mode, yatra groups, ERSS-112 plan.
### Phase 7 — Scale and deployment
Tenant onboarding from CSV, Render blueprint + on-prem one-command install, load test (API p95 ≈ 30 ms), DR drill (RTO 3.4 s), ASVS L2 self-assessment.
### Phase 8 — Transparency
Public dashboard `/web/transparency`, k-anonymous open data (CSV/JSON), CPGRAMS and CM-helpline adapters (dry run), embeddable widgets, final documentation.


## [Unreleased] — Phase 0: demo-safe hardening (2026-11-21)
### Security
- Server refuses to start without strong `JWT_SECRET` / `DEPT_JWT_SECRET`; no seeded or published admin credentials; random rotatable department codes.
- Every API route validated (zod), authorised and scoped; route-inventory test.
- SOS victim data delivered only to district staff, police and the victim (was broadcast to all users and to an unauthenticated stream).
- Police CPR/PCR consoles and APIs require police/USDMA or admin credentials.
- Uploads content-checked with size limits; SOS audio is private and access-audited.
- helmet, CORS allow-list, per-phone login limits; `node_modules` no longer served.
### Changed
- Complaint lifecycle state machine: officers submit proof, only the citizen can close; the 3rd rejection escalates.
- AI through a sovereign gateway (Sarvam / self-hosted / rules); photo checks fail closed to manual review.
- Data persisted as an atomic JSON snapshot (every 30 s and on shutdown).
### Removed
- OpenAI, Groq and NVIDIA integrations; fake predictions, random worker GPS (demo-only now), mock bills (demo-only), fake QR; fabricated news, stats and stock evidence photos.
### Added
- `npm run seed:demo`, `npm run smoke`, `npm run egress:audit`, `npm run secrets:scan`, `npm run migrate:pins`; `DEMO.md`; 79 automated tests.

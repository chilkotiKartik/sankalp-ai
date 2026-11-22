# OWASP ASVS 4.0.3 — Level 2 self-assessment (Phase 7.5)

**Scope:** SANKALP API server, HTML portals and the Expo app's server interactions. **Date:** 2026-11-21. **Method:** self-assessment against each ASVS chapter, with the evidence below (code, tests, CI checks), plus five independent review rounds whose findings were fixed (`docs/reports/phase-*.md`). **This is not a certification.** A CERT-In empanelled auditor must verify it (see the audit pack at the end).

Status key: ✅ met · 🟡 partly met / compensating control · ⬜ not applicable · ❌ gap (tracked)

| Chapter | Status | Evidence |
|---|---|---|
| **V1 Architecture** | ✅ | Every route is declared through `server/lib/route.ts` (auth level + RBAC permission + zod schemas + tenant scope). `tests/platform.test.ts` fails if a route lacks any of these, and reviews the public allow-list. Threat-relevant decisions are in DECISIONS.md |
| **V2 Authentication** | ✅ | bcrypt PINs; OTP hashed, 5 attempts carried across re-issue (P1-M1). Staff cannot log in by OTP alone. Per-phone (normalised) + per-IP limits. No default credentials (bootstrap super-admin from env, then removed) |
| **V3 Session management** | ✅ | 15 min HS256 JWT bound to tenant + session. 30-day refresh tokens rotated with reuse detection (family revoke). Logout works with an expired token (P1-H1). Streams re-validated every 25 s (P1-M4) |
| **V4 Access control** | ✅ | Deny by default (`permits()`); district/department/tenant scoping (`staffFor`, `emergencyDistrict`, `manageScope`); department tokens tenant-bound (P1-C1). Fraud-type proof flags need an independent reviewer (P3-5). Tests per role in `tests/auth-rbac.test.ts` and review regressions |
| **V5 Validation, sanitisation, encoding** | ✅ | zod on every body/query/param; NUL rejected (P1-C2); HTML escaping in server-rendered pages (`/s`, `/c`, `/web/disaster`); React escaping in portals; Leaflet popups via `sankalpEsc` |
| **V6 Stored cryptography** | ✅ | AES-256-GCM vault with key ids and rotation (`EVIDENCE_ENC_KEY`, `EVIDENCE_ENC_KEYS_OLD`, P6-7); HMAC-SHA256 signed links with purpose separation; random IVs; `crypto.randomInt/randomBytes` for codes; hash-chained audit log |
| **V7 Error handling and logging** | ✅ | pino JSON logs with redaction (phones, names, GPS, tokens, PINs). `X-Request-Id` on every response. Generic 500s. Security events audited (login failures, SOS cancel attempts, evidence views, signed-link use) |
| **V8 Data protection** | ✅ | DPDP consent (428 until accepted), export, erasure with legal hold, retention dry run until legal sign-off (P1-M7). PII masking before any model call. Signed expiring links instead of PII in SMS (D-043). `Cache-Control: no-store` on personal data |
| **V9 Communications** | 🟡 | TLS terminates at nginx/Render (`deploy/nginx-sankalp.conf`); HSTS via helmet; Postgres TLS verified by default (P1-M6). *Gap:* mutual TLS for future ERSS-112 is planned only (docs/112_INTEGRATION_PLAN.md) |
| **V10 Malicious code** | ✅ | `npm run deps:audit` (no unreviewed high/critical) and gitleaks + pattern secret scan in CI; egress audit blocks foreign AI SDKs, raw `fetch` and browser speech recognition. No `eval`: CSP without `'unsafe-eval'` |
| **V11 Business logic** | ✅ | Explicit complaint state machine (exhaustive transition tests). No closure without proof + citizen "yes". Agents cannot close/reject (static test). SOS is never rate-limited (dedup instead). Idempotent offline submissions |
| **V12 Files and resources** | ✅ | Magic-byte sniffing, size limits, EXIF stripping that fails closed (P1-M3), decompression-bomb guard + worker-thread decoding (P3-2), private originals, signed variant-bound URLs (P1-M2) |
| **V13 API and web services** | ✅ | OpenAPI 3.1 generated from zod (CI checks it is current). CORS allow-list, strict JSON content types, body limits per route, per-sender webhook limits with shared secrets (constant-time compare) |
| **V14 Configuration** | 🟡 | Config validated at boot (zod; secrets ≥ 32 chars, different). Helmet CSP; no secrets in git (SECRETS_TO_ROTATE.md lists names only). *Partial:* CSP still allows `'unsafe-inline'` for the portals' inline bootstrap scripts; moving to nonces is tracked |

## Known gaps (tracked)
| Item | Plan |
|---|---|
| CSP `'unsafe-inline'` | Nonce-based CSP once portal bootstraps are moved to static files |
| Web portals keep tokens in `localStorage` (D-035) | httpOnly cookie session for portals |
| Single API instance per state (D-029) | Read-through Postgres queries for horizontal scale |
| No external penetration test yet | CERT-In empanelled audit before go-live |

## CERT-In audit pack (hand this to the empanelled auditor)
1. This document, plus `SECURITY.md` and `DATA_RESIDENCY.md`.
2. Architecture and data flows: `docs/MASTER_PROMPT.md` §6–7, DECISIONS.md, `docs/CHANNELS.md`, `docs/112_INTEGRATION_PLAN.md`.
3. Route inventory with auth and permission: `docs/ROUTES.md`, `docs/openapi.json`.
4. Independent review reports and fixes: `AUDIT_REPORT.md`, `docs/reports/phase-0.md` … `phase-6.md`.
5. Test evidence: `npm run test:coverage` (≥ 80% lines), `npm run smoke`, `npm run a11y`, `npm run loadtest` (docs/LOADTEST.md), `scripts/dr-drill.sh` (docs/DR.md).
6. Supply chain: `npm run deps:audit` output and `config/audit-allowlist.json` (each exception has a reason and review date).
7. Egress evidence: `npm run egress:audit`. The only outbound data host is `api.sarvam.ai` (India).
8. Logging and incident response: `docs/OPERATIONS.md` (alerts, log redaction, audit-chain verification), within CERT-In's 6-hour reporting window for incidents.
9. Staging credentials for the auditor are issued separately, never through this repository.

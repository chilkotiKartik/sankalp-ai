# Security policy — SANKALP AI

## Reporting a vulnerability
Please **do not open a public issue**. Report privately through GitHub's *Report a vulnerability* (Security → Advisories) on this repository, with steps to reproduce. Do not include real citizen data. We aim to acknowledge within 72 hours. Coordinated disclosure is appreciated; for anything affecting SOS or women-safety data, please treat it as urgent.

## Scope
- API server (`server/`), web portals (`server/web/`), mobile/web app (`app/`, `context/`, `lib/`).
- Out of scope: third-party services, denial of service through volumetric traffic, social engineering.

## Security model (summary)
| Area | Control |
|---|---|
| Secrets | `JWT_SECRET`, `DEPT_JWT_SECRET` required (≥ 32 chars, different) or the server refuses to start. `EVIDENCE_ENC_KEY` recommended. Never committed (`npm run secrets:scan` + gitleaks) |
| Authentication | PIN (bcrypt) or OTP for citizens; staff need their PIN. OTP attempts carry across re-issue. Limits per normalised phone and per IP |
| Sessions | 15-minute JWT access tokens (tenant + session bound), rotating refresh tokens with reuse detection, streams re-validated every 25 s |
| Authorisation | Every route declares auth level, permission, tenant scope and zod schemas (`server/lib/route.ts`). `tests/platform.test.ts` fails on any undeclared route and keeps the public allow-list explicit |
| Business rules | A complaint closes only with proof + the citizen's "yes". Machine signals and agents can never close or reject. Fraud-type proof flags need an independent reviewer |
| Evidence | AES-256-GCM vault with key ids and rotation; 5-minute variant-bound signed links; every view audited |
| Uploads | Magic-byte allow-list, size limits, decompression-bomb guard, decoding in a worker thread, EXIF stripping that fails closed |
| Data residency | Outbound HTTP only via `safeFetch()` + `EGRESS_ALLOWLIST`; `npm run egress:audit` in CI |
| Transport and headers | TLS at nginx/Render; helmet (CSP without `unsafe-eval`, HSTS), CORS allow-list. On a VM the app binds to 127.0.0.1 behind nginx |
| Abuse | Rate limits on auth, uploads, AI, webhooks (per sender) and SOS cancel (per alert). **SOS is never rate-limited**; it is de-duplicated |

Full self-assessment: [docs/ASVS.md](docs/ASVS.md) (OWASP ASVS 4.0.3 L2) with the CERT-In audit pack. Review history: `AUDIT_REPORT.md`, `docs/reports/`.

## Rotating secrets
1. Generate new values (`openssl rand -hex 32`) for `JWT_SECRET` and `DEPT_JWT_SECRET` and redeploy. All sessions are invalidated.
2. Rotate department codes: `POST /api/superadmin/departments/:id/rotate-code` (super admin). Old department sessions are revoked immediately.
3. Evidence key: set the new `EVIDENCE_ENC_KEY` and move the previous one to `EVIDENCE_ENC_KEYS_OLD` (comma-separated). Existing evidence stays readable.
4. Record what was rotated (names only) in `SECRETS_TO_ROTATE.md`.

# Security policy — SANKALP AI

## Reporting a vulnerability
Please **do not open a public issue**. Report privately through GitHub's *Report a vulnerability* (Security → Advisories) on this repository, with steps to reproduce. Do not include real citizen data. We aim to acknowledge within 72 hours. Coordinated disclosure is appreciated; for anything affecting SOS or women-safety data, please treat it as urgent.

## Scope
- API server (`server/`), web portals (`server/web/`), mobile/web app (`app/`, `context/`, `lib/`).
- Out of scope: third-party services, denial of service through volumetric traffic, social engineering.

## Security model (summary)
| Area | Control |
|---|---|
| Secrets | `JWT_SECRET`, `DEPT_JWT_SECRET` required (≥32 chars) or the server refuses to start; never committed (`npm run secrets:scan`) |
| Authentication | Phone + 6-digit PIN (bcrypt cost 12); legacy PINs re-hashed on login; sessions are random 256-bit tokens stored as HMAC-SHA256 |
| Authorisation | Every route declares an auth level, a permission and zod schemas (`server/lib/route.ts`); `tests/platform.test.ts` fails on any undeclared route |
| Data scoping | District admins → own district; departments → own categories; citizens → own SOS and own complaint details |
| Evidence | SOS audio is private, served only to the owner / district admin / police with an audit entry per access |
| Uploads | Content-sniffed allow-list (JPEG/PNG/WebP, M4A/AAC/WebM/Ogg/WAV), 8 MB / 15 MB limits, UUID names, `nosniff` |
| Data residency | Outbound HTTP only via `safeFetch()` + `EGRESS_ALLOWLIST`; `npm run egress:audit` in the gate |
| Transport | helmet (CSP, HSTS in production), CORS allow-list |
| Abuse | Rate limits on auth (per IP and per phone), uploads, AI. SOS is never rate-limited; it is de-duplicated |

See `AUDIT_REPORT.md` for the findings this design addresses and `DECISIONS.md` for known trade-offs.

## Rotating secrets
1. Generate new values (`openssl rand -hex 32`) for `JWT_SECRET` and `DEPT_JWT_SECRET` and redeploy. All sessions are invalidated.
2. Rotate department codes: `POST /api/superadmin/departments/:id/rotate-code` (super admin). Old department sessions are revoked immediately.
3. Record what was rotated (names only) in `SECRETS_TO_ROTATE.md`.

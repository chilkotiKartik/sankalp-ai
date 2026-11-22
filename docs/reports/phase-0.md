## Phase 0 — Demo-safe hardening: summary
The server was rewritten around one rule: every route declares who may call it, what it accepts and whose data it may touch, and a test enforces that.
Victims' SOS data now reaches only district staff, police and the victim. The police consoles require sign-in, and published credentials and guessable codes are gone.
A complaint can only close after an officer submits a proof photo **and** the citizen confirms. AI runs only on Indian providers or on-server rules, and photo checks fail closed to manual review.
Data survives restarts (atomic snapshot). Simulated and fabricated content exists only in demo mode, behind a visible DEMO badge.
A seeded demo, `DEMO.md` and a smoke test cover the full on-stage path. The app, portals and web build were updated to match.

## Tasks done
| ID | Commit | Change |
|---|---|---|
| S1 (setup) | f1380ee | Master prompt, CLAUDE.md, PROGRESS/DECISIONS, baseline, route/egress/data-model inventories |
| M2–M5, M7–M12, M14, M17, m1, m4, m13 | f724a4b | Server rewrite: config validation, route registry + zod, state machine, snapshot, scoped realtime, uploads/evidence, AI gateway, helmet/CORS/rate limits, 79 tests |
| M1, M9 | f724a4b | Worker GPS real (`POST /api/worker/location`), simulation demo-only; predictions replaced by computed signals with `n` + method |
| M13 | a42a088 | Secure token storage; demo login removed; real GPS, uploaded photos, proof-based officer flow; 20 lint errors fixed |
| M6, M15, M16, m3, P0.a–c | 86bac98 | Portals vendored + escaped + police sign-in; credentials removed from README/login/RTI auto-login; seed:demo, smoke, egress audit, secret scan, migrate:pins; DEMO.md |
| m8, m20 (pulled forward) | 5a91e17 | Deployment docs merged; SECURITY, DATA_RESIDENCY, CONTRIBUTING, CHANGELOG; production build configs |
| Review fixes | (this commit) | H1, H2, M1–M5, L1, L3, L5–L7, L9 fixed with regression tests (`tests/review-phase0.test.ts`) |

## Gate results (final run)
| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors (baseline 14) |
| `npm run lint` | 0 errors, 140 warnings (baseline 20 errors) |
| `npm test` | 89/89 pass (5 files) |
| Server boot + `GET /healthz` | 200 (tsx and production `server_dist/index.mjs`) |
| `npm run smoke` | SMOKE PASSED (18 requests), fresh server and demo-mode server |
| `npx expo export --platform web` | succeeds; `static-build/web` rebuilt from current source |
| `npm run egress:audit` | passed — 112 files, 8 reviewed hosts |
| `npm run secrets:scan` | passed (gitleaks not installable here — D-018) |
| `npm audit --omit=dev` | 0 critical, 1 high (`image-size` in Metro, build-time only — D-016), 15 moderate. Baseline: 2 critical, 22 high |
| Headless browser check of all portals + web app | no JavaScript errors; CPR console signs in with a police code and loads data |

## Egress audit (hosts)
- Outbound data: `api.sarvam.ai` (only if `SARVAM_API_KEY` is set)
- Opt-in foreign: `exp.host` (push, operator opt-in), `tile.openstreetmap.org` (development tiles only)
- User-initiated links: `www.openstreetmap.org`
- Non-network strings: `react.dev`, `leafletjs.com`, `bugs.chromium.org`, `bugzilla.mozilla.org`, `apps.apple.com`, `play.google.com`, `sankalp.uk.gov.in`

## Review-subagent findings and fixes
No critical findings. Fixed, each with a regression test:
- **H1:** the Health department stream received every SOS → now only the target department.
- **H2:** the police consoles looped back to login on a control-room code → patrols and night-safety accept police tokens.
- **M1:** proof could reuse the before-photo or any upload → it must be the actor's own new upload.
- **M2:** demo content survived the purge → every record created in demo mode is flagged and purged.
- **M3:** `geo: null` was rejected.
- **M4:** worker GPS was visible to citizens.
- **M5:** an expired session blocked SOS → sliding expiry, plus a 30-day SOS grace (revoked sessions still refused).
- **L1:** patrol-van location had no district check.
- **L3:** a failed officer update still saved the note.
- **L5:** the department portal couldn't list SOS.
- **L6:** the leaderboard showed full names → first name + initial.
- **L7:** the photo check used a stale token.
- **L9:** worker PIN lockout → per-phone limiter.

Deferred with reasons: L2 → D-021, L4 → D-022, L8 → D-023.

## Not done / not testable here
- **Physical device:** SOS triggers (shake, volume, side button, 6 taps), secure-store behaviour, camera proof capture, push notifications. They need a real phone, so test them before the 24 Nov demo.
- **M18:** `react-native-maps` still uses Google Maps on Android (Phase 1).
- **CSP:** portals still compile JSX in the browser, so the CSP allows `unsafe-eval` (D-010).
- **Persistence:** a JSON snapshot only, single instance (PostgreSQL is Phase 1).
- **`attached_assets/`** (11 MB) is still tracked. The m7 history clean-up needs your permission.

## Secrets to rotate
See `SECRETS_TO_ROTATE.md`:
- The old seeded admin and citizen PINs, and the `<dept>_2026` codes, are public in git history. Treat any old deployment as compromised.
- Set fresh `JWT_SECRET` and `DEPT_JWT_SECRET` on every deployment.
- The old default department-token secret is public. It is no longer accepted.

## Decisions taken
D-001 … D-023 in `DECISIONS.md`. Needs your input: **D-019** (MIT LICENSE vs "All Rights Reserved" README prose).

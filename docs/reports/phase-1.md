# Phase 1 report — Production foundation

**Status:** complete. The gate is green after the independent review and its fixes.
**Date:** 2026-11-21 · Branch `claude/sleepy-turing-n6wo0u`

## Gate results (after review fixes)
| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors (145 warnings, unchanged from baseline; no rule loosened) |
| `npm test` | 16 files, **147 tests passing**. Coverage threshold 70% enforced in CI |
| `npm run smoke` | PASSED (21 requests) against a freshly booted server |
| `npm run egress:audit` | passed. The only outbound data host is `api.sarvam.ai` (India) |
| `npm run secrets:scan` | passed |
| Postgres path | migrations, round trip, flush isolation and audit anchor tested on PGlite (no Docker, D-024) |

## What Phase 1 delivered
Postgres schema and driver (optional, `DATABASE_URL`), multi-tenancy, RBAC with 9 roles, OTP plus access/refresh tokens, private media with signed URLs and EXIF stripping, hash-chained audit log, DPDP consent/export/erasure/retention, structured logs with readiness alerts, CI, encrypted backups with a restore drill, and the minor issues (see PROGRESS.md).

## Independent review — findings and fixes
Every confirmed finding is fixed and has a regression test (`tests/review-phase1.test.ts` unless noted).

| ID | Finding | Fix |
|---|---|---|
| C1 | Department tokens were not tenant-bound | `tid` is in the signed payload and checked on every request |
| C2 | One bad row (NUL in jsonb, unique-key clash) stopped Postgres persistence for **all** tenants | NUL is rejected at the API (400 `INVALID_CHARACTERS`) and stripped in the driver. Deletes run before upserts. Each tenant flushes in its own try/catch. `/readyz` reports not-ready while any tenant fails (`tests/db.test.ts`) |
| H1 | Logout with an expired access token revoked nothing | Logout is public and revokes by refresh token or signed access token. App and portals send the refresh token |
| H2 | Erasure left personal data behind | Now also covers chat (matched by `senderId`, not by name), upvotes, rejections, votes, signatures, RSVPs, safety and night-safety reports, worker records/PINs, OTPs, complaint-event actor IDs, and original photos (deleted; their EXIF holds GPS). Export includes all of these (`tests/privacy.test.ts`) |
| H3 | The Postgres driver deleted audit rows once the in-memory list was trimmed; the anchor was not persisted | Audit rows are never deleted. The anchor is persisted and reloaded, and only post-anchor rows are loaded into memory (`tests/db.test.ts`) |
| H4 | Web portals died after 15 min; the app did not refresh after being backgrounded | `sankalp-common.js` refreshes once on 401, stores the rotated pair and replays the request (single-flight; stale tokens transparently swapped). The app refreshes on `AppState` → active |
| M1 | OTP attempts reset on re-issue; limiter keyed on the raw phone; staff could log in by OTP | Attempts carry over (5 failures lock the number until expiry). Limiter keys on normalised digits + tenant. Staff get 403 `PIN_REQUIRED` |
| M2 | Any department could sign originals; the signature did not cover the variant | Originals: state staff, the case's district admin, or the case's own department/officers. The variant is part of the HMAC (`tests/media.test.ts`) |
| M3 | `stripJpeg` failed open on fill bytes and progressive JPEGs | Rewritten: skips fill bytes, strips APPn/COM between scans, and throws on anything unparseable, so the upload is rejected (fail closed). PNG/WebP length checks added |
| M4 | SSE/WebSocket streams were not re-checked after logout or erasure | Every 25 s heartbeat re-validates the session (`streamStillAuthorized`). WS sockets close with 4001 and pick up role changes |
| M5 | Personal police and USDMA accounts had state-wide SOS access | `emergencyDistrict()`: personal police accounts are scoped to their district. The state control-room code remains state-wide (D-033) |
| M6 | Shutdown could miss in-flight writes; TLS was unverified | `flushUntilStable()` on shutdown. TLS certificates are verified by default (`DATABASE_SSL=insecure` is an explicit opt-out) |
| M7 | Retention ignored `needsLegalConfirmation` and could purge open SOS evidence | Dry run (audited, nothing deleted) while unconfirmed. SOS evidence is purged only for resolved alerts not on legal hold |
| L1 | SSE stream budget was not per tenant | Key includes the tenant |
| L2 | The audit verifier silently skipped legacy entries | Reports `legacyUnchained`. An unchained entry after the chain started fails verification |
| L3 | Pruning lost refresh-token reuse detection | Used tokens are kept 7 days after use |
| L4 | Generic records reloaded in id order | Reloaded in timestamp order |

Also fixed while reviewing: the portal ticker invented "live" announcements when the API returned none (rule 3). It now shows only official helpline numbers.

## Known limitations (honest)
- Audit log rows keep the actor's display name: the hash chain makes entries immutable, and the log is kept as a legal record. This is documented in DATA_RESIDENCY.md (legal basis) and needs legal confirmation.
- Retention periods are defaults awaiting legal confirmation, so retention is currently a dry run by design.
- Postgres mode supports a single API instance per database (D-029).
- LICENSE versus the README "All Rights Reserved" text still needs the owner's decision (D-019).

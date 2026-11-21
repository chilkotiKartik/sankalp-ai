# Phase 6 report — Safety and disaster

**Status:** complete. The gate is green after the independent review and its fixes. **Date:** 2026-11-21

## Delivered
| Task | What |
|---|---|
| P6.1 | SOS: the 5 triggers are kept. Trusted contacts (≤ 5) get an SMS with a **signed, expiring live-location link**, with no location or name in the text (D-043). Per-contact delivery with retry/backoff and provider receipts. Cancel needs the PIN or a one-time SMS code (locks after 5). De-duplication instead of rate limiting. **Offline fallback:** the phone's own SMS app opens to the contacts with the last known GPS |
| P6.2 | Evidence vault: AES-256-GCM at rest for SOS evidence and GPS-bearing originals. Key ids and rotation (`EVIDENCE_ENC_KEY`, `EVIDENCE_ENC_KEYS_OLD`), independent of the session secrets. Access: owner, police, district admin. Every view audited |
| P6.3 | Check-in timer (missed → contacts get a signed link once; "I'm safe" sends an all-clear). Fake incoming call that works offline. App Safety tools screen |
| P6.4 | Nearest-station police routing on every SOS route. `docs/112_INTEGRATION_PLAN.md` (plan only; no live ERSS integration without approval) |
| P6.5 | Disaster mode (config or runtime; district authorities only for their own district). `disaster_authority` role and USDMA sessions. Verified-only public road/landslide reports, relief camps, area broadcasts, reviewed missing-person reports (masked, no reporter identity — D-044). `/web/disaster` with no JS, < 30 KB, axe clean |
| P6.6 | Yatra groups (code join, ≤ 10 days), locations only within the group, "I'm lost" plus silence flags, nearest medical point, helplines; expiry deletes every location (D-045) |

## Independent review — findings and fixes
| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | High | Overlapping delivery runs sent duplicate SMS and burned retries (reproduced) | One run per tenant; deliveries marked `sending` before the SMS call |
| 2 | High | Parallel wrong PINs bypassed the 5-attempt lock (reproduced) | Attempt reserved before the slow compare; per-alert limiter instead of per-IP |
| 3 | High | A district authority could switch disaster mode for the whole state (reproduced) | District authorities change only their own district; state-wide changes are state-only |
| 4 | High | USDMA department sessions could not use any disaster route (reproduced) | Management routes accept USDMA sessions; broadcast works without a user |
| 5 | Med | "I'm safe" after the alert was ignored | Allowed; contacts get an all-clear SMS |
| 6 | Med | OTP-created accounts (no PIN) could never cancel an SOS | Cancel accepts a one-time SMS code; 4–6 digit legacy PINs accepted |
| 7 | Med | Evidence key derived from `JWT_SECRET`: rotating it would destroy evidence | Keyring with key ids. Without `EVIDENCE_ENC_KEY`, a random `vault.key` in `DATA_DIR` (backed up). Old SKV1 files still readable |
| 8 | Med | Missing-person names public at once, unmasked, uncapped | Masked, staff review before publication (staff reports publish directly), ≤ 10 open per reporter |
| 9 | Low | Yatra silence flag never cleared; push carried the join code | Cleared on the next location; push carries no code |
| 10 | Low | Shared caches could mix tenants' disaster pages; cancelled SOS retention; cancel SMS to never-alerted contacts | `Vary: X-Tenant, Host`; retention uses `cancelledAt`; cancel SMS only to contacts who were alerted |

The review confirmed that nothing in Phase 6 can block or rate-limit SOS creation, and that cancelling never suppresses a new SOS.

## Limits
- No live ERSS-112 connection: it needs state approval.
- The fake call uses vibration, not a bundled ringtone.
- Device testing of the SMS composer on iOS and Android is still to be done on hardware.

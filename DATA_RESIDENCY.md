# Data residency & privacy — SANKALP AI

**Principle:** citizen data stays in India. The government client owns the data; SANKALP acts only as a processor (DPDP Act 2023). Citizen data is never sold or shared.

## Where data goes
| Data | Stored | Leaves the server? |
|---|---|---|
| Accounts, complaints, SOS, audit log | Server `DATA_DIR` (snapshot; PostgreSQL from Phase 1) on Indian infrastructure | No |
| Complaint photos | `DATA_DIR/uploads` (public, UUID names, no EXIF re-served) | No |
| SOS audio evidence | `DATA_DIR/private` — authenticated + audited access only | No |
| AI text (optional) | Sent to **Sarvam AI (India)** or a self-hosted model on Indian infrastructure, only if configured | Only to allow-listed Indian hosts |
| Photo analysis (optional) | Self-hosted vision model only; otherwise a human reviews it | Only to allow-listed hosts |
| Push notifications | Payload `"Update on #REF"` — no names, phones or locations | Only if the operator opts in to the `expo` driver |

## Enforcement
- `server/lib/safeFetch.ts` is the only outbound HTTP path; hosts outside `EGRESS_ALLOWLIST` throw before any socket opens.
- `npm run egress:audit` lists every host that appears in source and fails on any host not reviewed in `config/egress-allowlist.json`.
- Logs never contain request bodies; `server/lib/logger.ts` redacts phones, names, addresses, GPS and tokens.

## Retention (defaults — **needs legal confirmation**)
Complaints 3 years; media 1 year after closure; SOS evidence 1 year unless under legal hold. Purge jobs and data-subject access/erasure requests arrive with Phase 1.9.

## Known exceptions (tracked)
- `react-native-maps` uses Google Maps on Android until M18 (Phase 1) makes the map provider configurable.
- Development builds use OpenStreetMap tiles when `MAP_TILE_URL` is unset (never in production).

# Data residency & privacy — SANKALP AI

**Principle:** citizen data stays in India. The government client owns the data; SANKALP acts only as a processor (DPDP Act 2023). Citizen data is never sold or shared.

## Where data goes
| Data | Stored | Leaves the server? |
|---|---|---|
| Accounts, complaints, SOS, check-ins, yatra groups, audit log | `DATA_DIR` snapshot or PostgreSQL, on Indian infrastructure | No |
| Complaint photos | Public copy with EXIF/GPS stripped (`uploads`); original **encrypted** (AES-256-GCM) for verification | No |
| SOS audio/evidence | `private`, encrypted at rest; owner, police and district admin only; every view audited | No |
| AI text, speech, translation (optional) | **Sarvam AI (India)** or a self-hosted model on Indian infrastructure. PII is masked first, and text that still looks like PII is never sent | Only to allow-listed Indian hosts |
| Photo analysis (optional) | Self-hosted vision model only; otherwise a human reviews it | Only to allow-listed hosts |
| SMS / voice (optional) | DLT-registered Indian gateway, Indian IVR provider. Templates carry ticket ids, states and signed links, never names, phones or places | Only to allow-listed hosts |
| WhatsApp (optional, off by default) | Indian BSP preferred; Meta's Cloud API would be foreign and needs an explicit allow-list entry | Only if the operator opts in |
| Push notifications | `"Update on #REF"`, with no personal data | Only if the operator opts in to the `expo` driver |
| Backups | Encrypted before upload, to two **Indian** regions | Only to the configured India-region buckets |
| Open data | Monthly aggregates; counts below 5 suppressed (k-anonymity); no text, ids or sub-ward locations | Public by design |

## Enforcement
- `server/lib/safeFetch.ts` is the only outbound HTTP path. Hosts outside `EGRESS_ALLOWLIST` throw before any socket opens.
- `npm run egress:audit` runs in CI. It fails on any unreviewed host, raw `fetch`, foreign AI SDK, or browser `SpeechRecognition` (which streams audio to the browser vendor).
- Logs never contain request bodies. pino redacts phones, names, addresses, GPS, tokens and PINs.

## DPDP Act 2023
- Consent: complaints, RTIs and petitions need the current notice accepted (HTTP 428 otherwise). SOS never does.
- Rights: export (`/api/privacy/my-data`) and erasure. Erasure covers chats, votes, safety reports, check-ins, yatra memberships, missing-person reports and original photos; legal hold applies to SOS cases.
- Retention: complaints 3 years, media 1 year after closure, SOS evidence 1 year unless on legal hold. **These periods need legal confirmation**, so the purge job runs as an audited dry run until the tenant sets `needsLegalConfirmation: false`.
- Emergencies (s.7): missing-person reports in disaster mode are public after staff review, masked, without the reporter's identity.

## Known exceptions (tracked)
- Render (pilot hosting) has no Indian region. Production runs on an Indian VM or State Data Centre (`deploy/install-onprem.sh`).
- Development builds use OpenStreetMap tiles when `MAP_TILE_URL` is unset (never in production).

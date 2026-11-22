# Phase 5 report — Reach every Indian

**Status:** complete, with two items that need a device build (see Limits). The gate is green after the independent review and its fixes. **Date:** 2026-11-21

## Delivered
| Task | What |
|---|---|
| P5.1 | Offline outbox (`lib/offline-queue.ts`): per user, one storage key per item, size cap, backoff, token refresh on 401, failed list with retry. Server de-duplicates by `clientRequestId`, including concurrent retries. "Saved — will send when online" |
| P5.2 | SMS keywords (`SANKALP` / `STATUS` / `AGREE` / `HELP`). Missed call → IVR → Sarvam STT → ticket; without STT it is filed for human transcription. SMS status replies. Docs: `docs/CHANNELS.md` |
| P5.3 | WhatsApp citizen-initiated webhook and driver (off by default; the Meta Cloud API is flagged as foreign). Templates carry no personal data |
| P5.4 | `locales/` en + hi complete, Garhwali/Kumaoni drafts `needs_review` (D-041), `lib/i18n.ts`, `npm run i18n:check` in CI, Sarvam translate scaffold for the 22 scheduled languages |
| P5.5 | Voice-first complaint: mic → `/api/ai/transcribe` (Sarvam, India; consent required; audio not stored) → editable text. The browser Web Speech API (sends audio to Google) is removed, and the egress audit blocks it (D-042) |
| P5.6 | gzip, 1-year caching of hashed bundles, portal JSX compiled on the server. On 2G: portal 23–27 s → 3–5 s; unthrottled: 2.7–4.8 s → 0.15–0.24 s. `npm run perf`, `docs/PERFORMANCE.md` |
| P5.7 | `npm run a11y` (axe, WCAG 2.1 A/AA): 0 violations on 7 portals, run in CI. App: offline banner (m14), labels and 44 px targets on SOS/submit/voice/language (m15), on-device photo resize (m16), +91 normalisation and PIN codes (m17) |

## Independent review — findings and fixes
| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | High | A foreign number (e.g. `44…`) was cut to 10 digits and acted as an Indian user (reproduced) | Only +91 / 91 / 0 / bare 10-digit numbers accepted; anything else rejected |
| 2 | High | Real recordings hit the 100 KB JSON limit (reproduced) | IVR and transcribe routes moved to the large-body limit; test uses a ~300 KB clip |
| 3 | High | Queued reports were sent under the next user who signed in | Outbox keyed per user; only the signed-in user's items are sent |
| 4 | High | An expired token moved queued reports to "failed" for good | 401/403/428 retryable; one token refresh before retrying; failed items can be retried |
| 5 | Med | One oversized row could wipe the whole queue | One key per item, 1.5 MB cap refused up front, a corrupt index is never treated as empty |
| 6 | Med | Stray SMS created accounts; staff numbers got a second citizen account (reproduced) | Accounts only on `SANKALP`; existing account reused; staff numbers refused; STATUS covers all of the person's accounts; pending text expires in 24 h |
| 7 | Med | A retry during classification could create a duplicate | In-flight reservation per user + `clientRequestId` |
| L | Low | Gateway-IP rate limit; `'unsafe-eval'` in CSP; non-hashed vendor files cached as immutable; transcription before consent | Per-sender limiter; `'unsafe-eval'` removed (verified no eval/CSP errors); vendor cache 1 day; consent required |

## Limits (honest)
- **Device-only measurements:** native cold start on a low-end phone and APK size need an EAS build on a device; they are not measured here.
- **Citizen web app on 2G:** the first visit still takes ~30 s (923 KB gzipped). Repeat visits take under 1 s.
- **Languages:** Garhwali/Kumaoni need native-speaker review. The other 20 scheduled languages are scaffolded only.
- **Unverified formats:** whether Sarvam accepts Android AMR/3GP recordings has not been tested.

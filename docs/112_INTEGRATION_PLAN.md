# ERSS-112 integration plan (Phase 6.4)

**Status:** plan only. **SANKALP does not connect to ERSS-112 or any state Dial-112 system.** A live integration needs written approval from the State Police / ERSS nodal officer, a signed data-sharing agreement and a security review. Until then the app always shows **"Call 112"** as the first action, and SOS alerts go to the district control room through SANKALP.

## 1. What already works (no integration needed)
| Capability | Where |
|---|---|
| SOS → nearest police station(s) from the tenant's `policeStations` list (great-circle distance) | `server/routes/sos.ts`, `storage.getNearestPoliceStations` |
| SOS → district control room in real time (WebSocket/SSE, CPR console) | `server/realtime.ts`, `/web/cpr`, `/web/pcr` |
| Trusted contacts get an SMS with a signed live-location link | `server/safety/sos.ts` (P6.1) |
| "Call 112" button on every SOS screen and on the contact's location page | app SOS tab, `/s/:token` |
| De-duplication instead of rate limiting (rule 9) | `storage.createSos` |

## 2. Target integration (after approval)
```
Citizen app ──SOS──▶ SANKALP API ──(a) push event──▶ ERSS-112 CAD (State ERC)
                         ▲                                   │
                         └──(b) status callback (dispatched / on scene / closed)
```
- **(a) Event push:** on a new (non-duplicate) SOS, SANKALP POSTs a minimal event to the ERSS-112 interface the state provides: event id, category, latitude/longitude, accuracy, time, a callback number (only with the citizen's consent), and language. No photos or audio by default. Evidence is shared only on a police request through the evidence vault (P6.2), and that access is audited.
- **(b) Status callback:** ERSS calls a signed SANKALP webhook with dispatch status. SANKALP shows it to the citizen ("Police vehicle dispatched") and in the CPR console.
- **Transport:** HTTPS with mutual TLS, inside India. The ERSS host is added to `EGRESS_ALLOWLIST` and all calls go through `safeFetch`. Retries with backoff and an idempotency key (the SOS id), so the ERSS side is never double-counted.
- **Failure mode:** if the ERSS push fails, the SOS still reaches the district control room and trusted contacts, and the app keeps showing "Call 112". An ERSS outage never blocks an SOS (rule 9).

## 3. Data and legal checklist (to complete before going live)
- [ ] Written approval from the State ERSS nodal officer; named technical contact.
- [ ] Data-sharing agreement: purpose (emergency response only), retention, deletion, breach notification under the DPDP Act 2023 and CERT-In directions.
- [ ] Consent text in the app for sharing the callback number with 112 (en/hi; Garhwali/Kumaoni after review).
- [ ] Interface specification from C-DAC/ERSS (field list, auth, test endpoint).
- [ ] Load test of the push path; SOS creation stays non-blocking (asynchronous queue).
- [ ] Joint drill with the control room: end-to-end time from SOS to CAD event, target < 10 s.
- [ ] Security review (OWASP ASVS L2 items for the webhook) and a CERT-In empanelled audit.

## 4. Implementation notes (when approved)
- New module `server/integrations/erss112.ts` with a driver interface (`none` by default, `erss-http` after approval). It is called from `alertStaff` in `server/routes/sos.ts`, never awaited on the request path.
- New public webhook `/api/integrations/erss112/status` with a per-tenant secret and mutual TLS at the ingress.
- Tests: contract tests against the provided test endpoint; a fault-injection test showing an SOS still reaches the control room when ERSS is down.

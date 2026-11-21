# Current data model and flows — baseline (e0dc721)

All state lives in one `AppStorage` instance (`server/storage.ts:676`) in JS memory. It's lost on restart.
At construction, `seed()` generates users with plaintext PINs, random complaints, workers, wards, SOS alerts, RTIs, polls and so on.

## Entities (storage fields)
| Field | Type | Notes |
|---|---|---|
| `users: Map<id, AppUser>` | id, name, phone, pin (bcrypt or **plaintext** for seeded), role `citizen\|worker\|admin\|super_admin`, district, points, badges, level | Seeded super admin `9999…`, 6 district admins, 20 citizens |
| `tokens: Map<token, {userId, expiresAt}>` | random UUID, 7-day TTL | Not hashed |
| `workerTempTokens: Map<phone_complaintId, {pin, expiresAt}>` | 6-digit PIN from Math.random, 48 h | PIN also copied onto the complaint |
| `complaints[]` | id, ticketId `UK-#####`, category (14), description, location, geo, ward, wardNumber, district, priority P1–P4, status `pending\|in_progress\|resolved\|closed`, submittedBy, submittedByPhone, upvotes, upvotedBy[], aiScore/aiConfidence (**random**), before/after/proof photos, rating, rejectedBy[], reopened, department, assignedWorker{Name,Phone,Pin} | **No userId stored** |
| `sosAlerts[]` | id, category (10), geo, liveGeo, district, status `active\|responding\|resolved`, triggeredBy, audioRecordingUrl, audioChunks[] | **No userId stored** |
| `wards[]` | healthScore recomputed from complaints (`recomputeWards`) | Static ward list (WARDS_DATA) |
| `workers[]` | Random names/phones; GPS random-walked every 8 s (`routes.ts:29`) | Fake |
| `patrolVans[]`, `safetyIncidents[]`, `nightSafetyZones[]` | CPR command data | Seeded vans |
| `policeStations`, `emergencyServices` | Reference data (real-ish names/phones) | Static |
| `riskZones[]`, `announcements[]`, `polls[]`, `petitions[]`, `rtis[]`, `civicEvents[]`, `chatMessages[]`, `budgetItems[]`, `auditLogs[]` (cap 5000, random "hash") | — | — |
| Module-level: `pushTokenStore` (routes.ts:49), `RL_MAP` rate-limit | — | Also in memory |

## Complaint flow
1. App `POST /api/complaints` with category, description, location, **random geo** (`complaints.tsx:364`) and `beforePhoto` (local `file://` URI on native, or a data URL on web).
2. `createComplaint` assigns ticketId, random aiScore, department via `assignDepartment(category)` and +10 points. It broadcasts the full complaint to **every** WebSocket client.
3. Dept portal `PUT /api/dept/complaints/:id/assign-worker` creates a worker PIN and sets status `in_progress`.
4. The worker (phone+PIN, no session) calls `PUT /api/complaints/:id/proof` → status `resolved`.
5. **Any** user `PUT /api/complaints/:id/resolve` → `resolved` (+5 points, repeatable). The admin or any dept can set any status string.
6. `PUT /:id/reject` by 3 distinct users → `in_progress` + `reopened`.
7. SLA job (5 min) re-logs and broadcasts every breached complaint, every run.

## SOS flow
1. App triggers (6 taps / hold / shake / volume / power) → `POST /api/sos/women-safety` (or `/api/sos`, `/api/sos/forest-fire`).
2. The server creates the alert and a CPR safety incident (auto-dispatches a van). Name, phone and geo are broadcast to all WS clients, the CPR SSE (no auth) and dept SSE. Expo push goes to admins with the name and location in the body.
3. The app sends `PUT /api/sos/:id/location` every few seconds and records 10 s audio chunks. These go to `POST /api/upload/audio` (fails over 100 KB), then `PUT /api/sos/:id/audio-chunk`.
4. Admin `PUT /api/sos/:id/resolve`. The CPR portal (no auth) updates incident status.

## Worker flow
Worker records are seed data with simulated GPS. There is no real worker login or location API. The `/api/workers/stream` SSE needs a header that EventSource cannot send.

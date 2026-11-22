# Operations runbook — SANKALP AI

Target: the existing Render web service (Expo web bundle + API in one Node process). No Docker is required (DECISIONS D-024).

## 1. Health and monitoring
| Probe | Meaning | Use |
|---|---|---|
| `GET /healthz` | Process is up | Render health check path |
| `GET /readyz` | Tenants loaded **and** storage reachable/writable (503 otherwise) | Uptime monitor / load balancer |
| `X-Request-Id` | Present on every response, also in 500 errors | Quote it when reporting a problem; search the logs for `reqId` |

**Downtime alerts:** set `ALERT_PHONES` (comma-separated, SMS via the configured DLT driver) and/or `ALERT_WEBHOOK_URL` (its host must be in `EGRESS_ALLOWLIST`). The server checks readiness every 60 s and sends `DOWN` / `RECOVERED` messages with no personal data. Pair this with an external uptime check on `/readyz`, because a crashed process cannot alert about itself.

Logs are structured JSON (pino) on stdout/stderr. Phones, names, GPS, tokens and PINs are redacted. Do not add third-party log shippers that store data outside India.

## 2. Storage drivers
| Driver | Configure | Notes |
|---|---|---|
| `snapshot` (default) | `DATA_DIR` on a **persistent disk** | One JSON snapshot per tenant, written atomically every 30 s and on shutdown |
| `postgres` | `STORAGE_DRIVER=postgres`, `DATABASE_URL=postgres://…` (Render Postgres) | Migrations run at boot. Changed rows are written within ~300 ms |
| `postgres` (embedded) | `DATABASE_URL=pglite:/path/on/disk` | Real Postgres engine in-process. No server needed |

Moving from snapshot to Postgres:
```bash
DATABASE_URL=postgres://… npm run db:migrate-snapshot
```
Then set `STORAGE_DRIVER=postgres` and restart. The command is idempotent.

Changing the schema: edit `server/db/schema.ts`, then run `npm run db:generate`. Commit the new file in `server/db/migrations/`; it is applied automatically at the next boot.

## 3. Backups and restore drill (P1.12)
Backups are encrypted (AES-256, PBKDF2) before they leave the machine. Keep `BACKUP_PASSPHRASE` in a password manager, never in git.

```bash
BACKUP_PASSPHRASE=… BACKUP_DIR=/mnt/backups DATA_DIR=./data scripts/backup.sh
```
- Postgres driver: `pg_dump` (custom format) plus a separate encrypted archive of uploads and evidence.
- Snapshot driver: a tar of `DATA_DIR`.
- Optional off-site copy: `BACKUP_S3_URI=s3://bucket/prefix` with `BACKUP_S3_ENDPOINT` set to an **India-region** S3-compatible endpoint (aws CLI required). Local copies keep the newest 14 (`BACKUP_KEEP`).
- Schedule: a Render Cron Job running the script daily. RPO is therefore 24 hours unless you run it more often.

**Restore drill (do this monthly and record the result):**
```bash
BACKUP_PASSPHRASE=… scripts/restore.sh backups/sankalp-<stamp>.data.enc /tmp/restore-test
```
```bash
DATA_DIR=/tmp/restore-test JWT_SECRET=… DEPT_JWT_SECRET=… PORT=5099 npm run server
```
```bash
SMOKE_BASE_URL=http://localhost:5099 npm run smoke
```
```bash
DATA_DIR=/tmp/restore-test npm run audit:verify
```
The drill passes when the checksum verifies, the restored server reaches `/readyz` 200, the smoke test passes, and the audit chain verifies. Last verified in this repository: 2026-11-21, snapshot driver (backup → restore → byte-identical).

## 4. Audit log integrity (P1.7)
```bash
npm run audit:verify
```
This recomputes every tenant's hash chain and exits 1 on any edited, deleted or reordered entry. State admins can also call `GET /api/admin/audit/verify`. Run it after every restore and include it in monthly checks.

## 5. Secrets and access
- Rotate `JWT_SECRET` / `DEPT_JWT_SECRET` by setting new values and restarting. All sessions end and users sign in again.
- Department codes: `POST /api/superadmin/departments/:id/rotate-code`. Existing department sessions are revoked at once.
- Staff accounts: `POST /api/superadmin/users` with roles `officer` / `dept_admin` (need `departmentId`), `district_admin`, `police`, `state_admin`, `worker`.
- First state admin: `BOOTSTRAP_SUPER_ADMIN_PHONE` + `BOOTSTRAP_SUPER_ADMIN_PIN` once, then remove them.

## 6. Privacy operations (P1.9)
- Erasure requests on legal hold: `GET /api/privacy/erasure-requests` (state admin), then decide with `PUT /api/privacy/erasure-requests/:id`.
- SOS evidence legal hold: `PUT /api/sos/:id/legal-hold` (police / state).
- Retention runs daily. Periods come from the tenant config `retention` and **need legal confirmation** before production use.

## 7. Tenants (states)
Each state is `config/tenants/<id>.json`, validated at boot (the server refuses to start on an invalid config). Clients select a tenant with the `X-Tenant` header or a host listed in the tenant's `hosts`. The default is `DEFAULT_TENANT` (`uttarakhand`). Department codes for non-default tenants are written to `DATA_DIR/tenants/<id>/dept-codes.initial.txt`.

## 8. Evidence vault keys (P6.2)
- Set `EVIDENCE_ENC_KEY` (64 hex chars) in production and keep it in the state's password manager. Without it, a random key is created once at `DATA_DIR/vault.key` (0600) and included in the encrypted backups.
- Rotation: put the new key in `EVIDENCE_ENC_KEY` and the old one(s) in `EVIDENCE_ENC_KEYS_OLD` (comma-separated). New files use the new key; old files stay readable.
- Rotating `JWT_SECRET` never affects evidence.

## 9. Channels and webhooks (P3.5, P5.2, P5.3, P6.1)
| Webhook | Secret header value |
|---|---|
| `/api/verification/sms-inbound` (replies, SMS commands) | `INBOUND_SMS_SECRET[_<TENANT>]` |
| `/api/channels/ivr/recording` (missed call) | `IVR_WEBHOOK_SECRET[_<TENANT>]` |
| `/api/channels/whatsapp/inbound` | `WHATSAPP_WEBHOOK_SECRET[_<TENANT>]` |
| `/api/sos/delivery-receipt` (SMS DLR) | `SMS_DLR_SECRET[_<TENANT>]` |

Send it as `X-Webhook-Secret`. Webhooks are limited per sender number. Details: `docs/CHANNELS.md`.

## 10. Disaster and yatra modes (P6.5, P6.6)
- Turn disaster mode on with `PUT /api/disaster/mode`. State staff can do it state-wide; a district authority only for its own district. Config `features.disasterMode` keeps it on permanently.
- Review citizen road reports and missing-person reports in the queues (`/api/disaster/reports/queue`, `/api/disaster/missing/queue`). Nothing citizen-reported is public before review.
- The low-bandwidth public page is `/web/disaster`.
- Yatra groups expire automatically (at most 10 days), and their locations are deleted.

## 11. New state onboarding (P7.1)
`npm run tenant:onboard -- --dir <csv folder> …` (see `config/tenants/templates/README.md`). It validates everything and refuses to write an invalid config. Restart the server to load the new state; department codes are created at boot in `DATA_DIR/tenants/<id>/dept-codes.initial.txt`.

## 12. Capacity, recovery and audits
- **Load:** `npm run loadtest` (local, writes `docs/LOADTEST.md`) and `loadtest/k6.js` (staging, from a separate machine).
- **DR drill, monthly:** `scripts/dr-drill.sh`. It runs with jobs off and console drivers, so it never contacts real people. Record the result in `docs/DR.md`.
- **Restore drill rule:** start a restored copy of production with `JOBS=off` and console SMS/voice drivers, unless it is the new live server.
- **Accessibility:** `npm run a11y` (axe, WCAG 2.1 AA) against a running server; it is also in CI.
- **Security:** `docs/ASVS.md` and the CERT-In audit pack. Run `npm run deps:audit` and `npm run egress:audit` before each release.

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

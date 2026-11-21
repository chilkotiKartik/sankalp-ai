# Disaster recovery (Phase 7.4)

## Objectives
| | Snapshot driver (default) | Postgres driver |
|---|---|---|
| **RPO, process crash** | ≤ 30 s (atomic snapshot every 30 s and on shutdown) | ≈ 300 ms (write-behind flush) |
| **RPO, server or disk lost** | time since the last backup: **24 h** with the daily cron, **1 h** with an hourly cron (recommended in production) | the provider's point-in-time recovery (minutes), plus the daily `pg_dump` |
| **RTO, measured** | **3.4 s** for 20,000 complaints / 17 MB of data (restore 0.3 s + boot to `/readyz` 3.1 s), plus the time to provision a VM (`deploy/install-onprem.sh`, typically 5–10 min) | restore time of the managed DB + the same boot |

## Backups
- `scripts/backup.sh` encrypts everything (AES-256, PBKDF2 200k) **before** it leaves the machine and writes a SHA-256 checksum.
- **Two Indian regions:** set `BACKUP_S3_URI` + `BACKUP_S3_ENDPOINT` (primary, e.g. Mumbai) and `BACKUP_S3_URI_2` + `BACKUP_S3_ENDPOINT_2` (second region, e.g. Hyderabad). Use separate credentials, and set object lock or versioning on the buckets.
- Local copies keep the newest 14 (`BACKUP_KEEP`).
- **Keys:** the backup contains the evidence key file (`vault.key`) only if `EVIDENCE_ENC_KEY` is not set. When it *is* set, keep it, and `BACKUP_PASSPHRASE`, in the state's password manager. **Without them the evidence cannot be read.** This is intentional.

## Drill (run monthly, record the line it prints)
```bash
DATA_DIR=/var/lib/sankalp BACKUP_PASSPHRASE=… JWT_SECRET=… DEPT_JWT_SECRET=… scripts/dr-drill.sh
```
It backs up, restores into an empty directory, boots a second server on port 5097, waits for `/readyz`, runs the smoke test and verifies the audit hash chain. It exits non-zero if any step fails.

Recorded drills:
| Date | Data | Backup | Restore | Boot → ready | RTO | Smoke | Audit chain |
|---|---|---|---|---|---|---|---|
| 2026-11-21 | 52 KB | 0.1 s | 0.1 s | 1.0 s | 1.2 s | passed | verified |
| 2026-11-21 | 17 MB (20k complaints) | 0.3 s | 0.3 s | 3.1 s | 3.4 s | passed | verified |

## Failover runbook
1. Declare the incident. Ops alerts are sent automatically when `/readyz` fails (`ALERT_PHONES`, `ALERT_WEBHOOK_URL`).
2. Provision a VM in the second region: `sudo bash deploy/install-onprem.sh`. Then copy the secrets (`JWT_SECRET`, `DEPT_JWT_SECRET`, `EVIDENCE_ENC_KEY`) into `/etc/sankalp/sankalp.env`.
3. Fetch the latest backup from the second-region bucket. Verify its checksum, then run `scripts/restore.sh <file> /var/lib/sankalp` and `systemctl restart sankalp`.
4. Verify: `/readyz` returns 200, `npm run audit:verify` passes, and `SMOKE_BASE_URL=… npm run smoke` passes against the new host.
5. Point DNS at the new host. Users keep their sessions, because the JWT secrets are the same.
6. Afterwards, record the actual RPO and RTO in the table above.

**SOS during an outage:** the app shows "Call 112" first on every SOS screen, and the offline SMS fallback works without the server (Phase 6). An outage of SANKALP must never be the reason someone cannot get help.

# Phase 7 report — India-wide scale and deployment

**Status:** complete. The gate is green after the independent review and its fixes. **Date:** 2026-11-22

## Delivered
| Task | What |
|---|---|
| P7.1 | `npm run tenant:onboard`: CSV templates → zod-validated tenant config, with row-level errors. A new state goes live by configuration alone (tested) |
| P7.2 | `render.yaml` (pilot) and `deploy/install-onprem.sh`: a one-command install on an Indian VM or State Data Centre (hardened systemd unit, nginx with SSE/WS, app bound to 127.0.0.1). No Docker/Helm (D-024) |
| P7.3 | `loadtest/k6.js` (staging) and `npm run loadtest`: API p95 26–31 ms, SSE fan-out p95 24 ms at 6 complaints/s, 500 officers, 200 streams, 20k complaints. Fixed a quadratic resolution-rate computation (290 → 0.9 ms) and the unpaginated department list |
| P7.4 | Backups to two Indian regions; `scripts/dr-drill.sh`; measured RTO 3.4 s for 20k complaints; RPO table; failover runbook (`docs/DR.md`) |
| P7.5 | `docs/ASVS.md`: L2 self-assessment (12 chapters met, 2 partial with tracked gaps) and the CERT-In audit pack |

## Independent review — findings and fixes
| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | Critical | Installer excluded every `data` folder, including `server/data/`, so the build failed (reproduced) | Anchored excludes (`/data`, `/node_modules`, `/.git`) |
| 2 | High | Template states had no `usdma` department, but SOS and disaster code needs it (reproduced) | Template fixed; onboarding requires `police` and `usdma` |
| 3 | Med | Onboarding accepted duplicates, unknown categories, negative SLA and unknown wards (reproduced) | Uniqueness (case/space-folded), category allow-list, SLA > 0, ward references checked |
| 4 | High | Render backup cron could never see the web service's disk, and failed silently | Cron removed and docs corrected; `backup.sh` fails when an off-site upload cannot run |
| 5 | High | Failover runbook restored into a non-empty directory with the wrong owner | `--no-start` install, stop and empty first, `chown` after restore |
| 6 | Med | App on `0.0.0.0:5000` with a trusted proxy hop, so a spoofable client IP | Installer sets `HOST=127.0.0.1`; `HOST` env supported |
| 7 | Med | Department portal used only the first 500; ties skipped at page boundaries | Compound (submittedAt, id) cursor; the portal follows the pages |
| 8 | Med | DR drill ran jobs (real SMS) and left decrypted data behind on failure | `JOBS=off`, console drivers, `trap` cleanup, snapshot archive only |
| L | Low | Rate cache could serve another store's entry; installer readiness check had no retry | Cache keyed on the store object; readiness polled for 60 s |

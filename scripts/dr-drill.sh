#!/usr/bin/env bash
# P7.4 disaster-recovery drill: backup → restore into an empty directory → boot → /readyz → smoke → audit chain.
# Prints the time of each step; the sum of restore + boot is the measured RTO for this data size.
# Usage: DATA_DIR=./data BACKUP_PASSPHRASE=… scripts/dr-drill.sh   (needs JWT_SECRET/DEPT_JWT_SECRET of that data)
set -euo pipefail
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}" "${DATA_DIR:?set DATA_DIR}" "${JWT_SECRET:?}" "${DEPT_JWT_SECRET:?}"
WORK="$(mktemp -d)"; PORT="${DR_PORT:-5097}"; PID=""
# Review P7-8: always clean up decrypted data and the test server, even on failure.
trap '[ -n "$PID" ] && (kill -- -$PID 2>/dev/null || kill $PID 2>/dev/null); rm -rf "$WORK"' EXIT
t() { date +%s.%N; }
el() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.1f s", b-a}'; }

T0=$(t); BACKUP_DIR="$WORK/backups" DATA_DIR="$DATA_DIR" STORAGE_DRIVER=snapshot BACKUP_S3_URI= BACKUP_S3_URI_2= bash scripts/backup.sh >/dev/null; T1=$(t)
FILE=$(ls -1t "$WORK"/backups/sankalp-*.data.enc | head -1)
bash scripts/restore.sh "$FILE" "$WORK/restored" >/dev/null; T2=$(t)
if curl -sf "localhost:$PORT/healthz" >/dev/null 2>&1; then echo "port $PORT is busy — stop that server or set DR_PORT"; exit 1; fi
# No jobs and console drivers only: a copy of production must never text or call real people.
JOBS=off SMS_DRIVER=console VOICE_DRIVER=console WHATSAPP_DRIVER=console PUSH_DRIVER=none STORAGE_DRIVER=snapshot DATA_DIR="$WORK/restored" PORT="$PORT" NODE_ENV=development setsid node_modules/.bin/tsx server/index.ts > "$WORK/server.log" 2>&1 &
PID=$!
for i in $(seq 1 120); do curl -sf "localhost:$PORT/readyz" >/dev/null && break; sleep 0.25; done
T3=$(t)
SMOKE_BASE_URL="http://localhost:$PORT" DATA_DIR="$WORK/restored" npm run smoke >/dev/null && SMOKE=passed || SMOKE=FAILED
DATA_DIR="$WORK/restored" npm run audit:verify >/dev/null && AUDIT=verified || AUDIT=FAILED
SIZE=$(du -sh "$DATA_DIR" | cut -f1)
echo "DR drill on $(date -u +%F): data $SIZE | backup $(el $T0 $T1) | restore $(el $T1 $T2) | boot to ready $(el $T2 $T3) | RTO (restore+boot) $(el $T1 $T3) | smoke $SMOKE | audit chain $AUDIT"
[ "$SMOKE" = passed ] && [ "$AUDIT" = verified ]

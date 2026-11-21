#!/usr/bin/env bash
# P1.12 — encrypted backup of SANKALP data. Usage: BACKUP_PASSPHRASE=… BACKUP_DIR=/mnt/india-backup scripts/backup.sh
#  - STORAGE_DRIVER=postgres with postgres:// URL → pg_dump (custom format)
#  - snapshot driver (or pglite:) → tar of DATA_DIR (snapshots, uploads, private evidence)
# Output: $BACKUP_DIR/sankalp-<UTC timestamp>.<kind>.enc  (AES-256-CBC, PBKDF2, 200k iterations) + .sha256
# Optional: BACKUP_S3_URI=s3://bucket/prefix (India region) uploads with the aws CLI if installed.
set -euo pipefail

: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE (store it in your password manager, not in git)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATA_DIR="${DATA_DIR:-./data}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
umask 077

if [[ "${STORAGE_DRIVER:-snapshot}" == "postgres" && "${DATABASE_URL:-}" == postgres* ]]; then
  KIND="pgdump"
  OUT="$BACKUP_DIR/sankalp-$STAMP.$KIND.enc"
  pg_dump --format=custom --no-owner "$DATABASE_URL" | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"
  # uploads/evidence still live on disk with the postgres driver
  tar -C "$DATA_DIR" -czf - --exclude='*.tmp' uploads private 2>/dev/null | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$BACKUP_DIR/sankalp-$STAMP.media.enc" || true
else
  KIND="data"
  OUT="$BACKUP_DIR/sankalp-$STAMP.$KIND.enc"
  tar -C "$DATA_DIR" -czf - --exclude='*.tmp' . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"
fi

( cd "$BACKUP_DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256" )
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  command -v aws >/dev/null || { echo "aws CLI not installed — skipping upload" >&2; exit 0; }
  aws s3 cp "$OUT" "$BACKUP_S3_URI/" ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"}
  aws s3 cp "$OUT.sha256" "$BACKUP_S3_URI/" ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"}
  echo "uploaded to $BACKUP_S3_URI"
fi
# P7.4: second copy in another Indian region (e.g. Mumbai + Hyderabad). Same encrypted object, separate credentials allowed.
if [[ -n "${BACKUP_S3_URI_2:-}" ]]; then
  command -v aws >/dev/null || { echo "aws CLI not installed — skipping second-region upload" >&2; exit 0; }
  aws s3 cp "$OUT" "$BACKUP_S3_URI_2/" ${BACKUP_S3_ENDPOINT_2:+--endpoint-url "$BACKUP_S3_ENDPOINT_2"}
  aws s3 cp "$OUT.sha256" "$BACKUP_S3_URI_2/" ${BACKUP_S3_ENDPOINT_2:+--endpoint-url "$BACKUP_S3_ENDPOINT_2"}
  echo "uploaded to second region $BACKUP_S3_URI_2"
fi

# retention of local copies (default 14)
ls -1t "$BACKUP_DIR"/sankalp-*.enc 2>/dev/null | tail -n +"$(( ${BACKUP_KEEP:-14} + 1 ))" | while read -r f; do rm -f "$f" "$f.sha256"; done

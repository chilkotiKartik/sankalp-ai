#!/usr/bin/env bash
# P1.12 — restore drill. Usage: BACKUP_PASSPHRASE=… scripts/restore.sh <backup.enc> <target-dir-or-DATABASE_URL>
# Verifies the checksum first. For *.data.enc the target is an EMPTY directory to use as DATA_DIR.
set -euo pipefail
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
SRC="${1:?backup file}"; TARGET="${2:?target}"
if [[ -f "$SRC.sha256" ]]; then ( cd "$(dirname "$SRC")" && sha256sum -c "$(basename "$SRC").sha256" ); else echo "warning: no checksum file" >&2; fi
case "$SRC" in
  *.data.enc|*.media.enc)
    mkdir -p "$TARGET"
    if [[ -n "$(ls -A "$TARGET" 2>/dev/null)" && "$SRC" == *.data.enc ]]; then echo "target $TARGET is not empty" >&2; exit 1; fi
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$SRC" | tar -C "$TARGET" -xzf -
    echo "restored files into $TARGET — start the server with DATA_DIR=$TARGET" ;;
  *.pgdump.enc)
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$SRC" | pg_restore --no-owner --clean --if-exists -d "$TARGET"
    echo "restored database into $TARGET" ;;
  *) echo "unknown backup type: $SRC" >&2; exit 1 ;;
esac

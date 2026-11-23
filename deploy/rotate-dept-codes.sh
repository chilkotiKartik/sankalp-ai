#!/usr/bin/env bash
# Rotate EVERY department access code in EVERY state (e.g. after codes were shared or exposed). Run as root:
#   bash /root/sankalp-ai/deploy/rotate-dept-codes.sh
# The new codes are written to private files (readable only by the server and root) and are NOT printed here.
# Everyone signed in with an old code is signed out. Police/department staff then use the new codes.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
DATA=/var/lib/sankalp
MARKER="$DATA/.rotate-dept-codes"
touch "$MARKER" && chown sankalp:sankalp "$MARKER"
systemctl restart sankalp
echo "Rotating codes for all states (takes about a minute)…"
for _ in $(seq 1 240); do [ -f "$MARKER" ] || break; sleep 1; done
if [ -f "$MARKER" ]; then echo "✗ Rotation did not finish — check: journalctl -u sankalp -n 50"; exit 1; fi
n=$(find "$DATA" -name dept-codes.initial.txt -newer /proc/1 2>/dev/null | wc -l)
echo "✓ All department codes rotated ($n states). Old codes no longer work; anyone signed in with them was signed out."
echo "  See the new codes for ONE state when you need them (do not paste them into chats):"
echo "    cat $DATA/tenants/<state-id>/dept-codes.initial.txt      e.g. tenants/kerala"
echo "    cat $DATA/dept-codes.initial.txt                          (the default state, Uttarakhand)"

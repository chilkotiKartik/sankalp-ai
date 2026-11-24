#!/usr/bin/env bash
# Make YOUR phone number a state administrator (super admin), with a fresh random 6-digit PIN. Run as root on the server:
#   bash /root/sankalp-ai/deploy/make-admin.sh 9XXXXXXXXX                 # Delhi + the default state
#   bash /root/sankalp-ai/deploy/make-admin.sh 9XXXXXXXXX kerala delhi    # the states you list
# Works whether or not the number is already registered (an existing account is promoted and signed out).
# The PIN is shown once, here only. Never paste it into chats, SMS or tickets. Re-run to get a new PIN.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
PHONE="${1:-}"
[[ "$PHONE" =~ ^[6-9][0-9]{9}$ ]] || { echo "✗ Give your 10-digit mobile number, e.g. bash $0 98XXXXXXXX"; exit 1; }
shift
DATA=/var/lib/sankalp
STATES=("$@")
if [ ${#STATES[@]} -eq 0 ]; then
  DEF=$(curl -fsS http://127.0.0.1:5000/api/public/config 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['tenant']['id'])" 2>/dev/null || true)
  STATES=(delhi); [ -n "$DEF" ] && [ "$DEF" != delhi ] && STATES+=("$DEF")
fi
PIN=$(od -An -N4 -tu4 /dev/urandom | tr -d ' ' | awk '{printf "%06d", 100000 + $1 % 900000}')
MARK="$DATA/.make-admin"
umask 077
: > "$MARK"
for s in "${STATES[@]}"; do printf '%s\t%s\t%s\n' "$s" "$PHONE" "$PIN" >> "$MARK"; done
chown sankalp:sankalp "$MARK"; chmod 600 "$MARK"
rm -f "$MARK.result"
systemctl restart sankalp
echo "Setting up the administrator (up to 3 minutes)…"
for _ in $(seq 1 180); do [ -f "$MARK" ] || break; sleep 1; done
for _ in $(seq 1 60); do curl -fsS http://127.0.0.1:5000/readyz >/dev/null 2>&1 && break; sleep 1; done
echo
ok=0
for s in "${STATES[@]}"; do
  how=$(awk -F'\t' -v s="$s" '$1==s{print $2}' "$MARK.result" 2>/dev/null | tail -1)
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:5000/api/auth/login -H 'Content-Type: application/json' -H "X-Tenant: $s" \
    -d "{\"phone\":\"$PHONE\",\"pin\":\"$PIN\"}")
  if [ "$code" = 200 ]; then echo "✓ $s: admin ${how:-ready}, sign-in tested OK"; ok=$((ok+1))
  else echo "✗ $s: sign-in test failed (HTTP $code, ${how:-not processed}). Check the state id, then: journalctl -u sankalp -n 40"; fi
done
rm -f "$MARK" "$MARK.result"
[ "$ok" -gt 0 ] || exit 1
echo
echo "  Phone: the number you typed     PIN: $PIN"
echo "  Sign in at https://sankalpai.app/web/pcr → choose the state → 'Admin phone + PIN'."
echo "  Write the PIN down now. Do not paste it into chats. Re-run this script any time for a new PIN."

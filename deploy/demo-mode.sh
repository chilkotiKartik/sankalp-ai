#!/usr/bin/env bash
# Demo mode ON THE LIVE SITE for events (D-062). Real data is never touched.
#   bash /root/sankalp-ai/deploy/demo-mode.sh on                 # adds demo data to Delhi + the default state
#   bash /root/sankalp-ai/deploy/demo-mode.sh on delhi kerala    # the states you list
#   bash /root/sankalp-ai/deploy/demo-mode.sh off                # back to real only: ALL demo data is removed
# While ON: every screen shows the "DEMO · simulated data" badge; demo records are ADDED next to real ones.
# IMPORTANT: anything created while demo mode is on (reports, SOS, sign-ups by visitors) counts as demo and is removed by
# "off". Your administrator account made with make-admin.sh is kept. Real SOS still reaches the police control room.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
ENV=/etc/sankalp/sankalp.env
DATA=/var/lib/sankalp
set_env() { grep -q "^$1=" "$ENV" && sed -i "s|^$1=.*|$1=$2|" "$ENV" || echo "$1=$2" >> "$ENV"; }
ready() { for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:5000/readyz >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }

case "${1:-}" in
  on)
    shift
    STATES=("$@")
    if [ ${#STATES[@]} -eq 0 ]; then
      DEF=$(curl -fsS http://127.0.0.1:5000/api/public/config 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['tenant']['id'])" 2>/dev/null || true)
      STATES=(delhi); [ -n "$DEF" ] && [ "$DEF" != delhi ] && STATES+=("$DEF")
    fi
    printf '%s\n' "${STATES[@]}" > "$DATA/.demo-data"; chown sankalp:sankalp "$DATA/.demo-data"; chmod 600 "$DATA/.demo-data"
    rm -f "$DATA/.demo-data.result"
    set_env DEMO_MODE true
    systemctl restart sankalp
    echo "Adding demo data (up to 3 minutes)…"
    for _ in $(seq 1 180); do [ -f "$DATA/.demo-data" ] || break; sleep 1; done
    ready || { echo "✗ Server did not come back: journalctl -u sankalp -n 40"; exit 1; }
    echo
    for s in "${STATES[@]}"; do
      how=$(awk -F'\t' -v s="$s" '$1==s{print $2}' "$DATA/.demo-data.result" 2>/dev/null | tail -1)
      f="$DATA/tenants/$s/demo-credentials.txt"; [ -f "$f" ] || f="$DATA/demo-credentials.txt"
      case "$how" in
        added)   echo "✓ $s: demo data added"; sed -n '2,6p' "$f" | sed 's/^/    /' ;;
        already) echo "✓ $s: already has demo data"; [ -f "$f" ] && sed -n '2,6p' "$f" | sed 's/^/    /' ;;
        *)       echo "✗ $s: not added (unknown state id?)" ;;
      esac
    done
    rm -f "$DATA/.demo-data.result"
    echo
    echo "  DEMO is ON at https://$(grep '^PUBLIC_BASE_URL=' "$ENV" | cut -d/ -f3). Every screen shows the DEMO badge."
    echo "  Demo accounts above use placeholder numbers (90000 0000x). Police screen: /web/pcr → state → Admin phone + PIN → Super admin."
    echo "  Turn off after the event (removes ALL demo data):  bash $0 off"
    ;;
  off)
    set_env DEMO_MODE false
    rm -f "$DATA/.demo-data"
    systemctl restart sankalp
    ready || { echo "✗ Server did not come back: journalctl -u sankalp -n 40"; exit 1; }
    removed=$(journalctl -u sankalp --since "-3 min" | grep -c demo_data_purged || true)
    find "$DATA" -name demo-credentials.txt -delete
    echo "✓ Demo mode OFF. Demo data removed from $removed state(s). Only real data remains."
    ;;
  *) echo "usage: bash $0 on [state-ids…] | off"; exit 1 ;;
esac

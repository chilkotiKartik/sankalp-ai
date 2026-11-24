#!/usr/bin/env bash
# A separate DEMO copy of SANKALP AI on the same server, for events and training (D-062).
# Every record is flagged demo and every screen shows the "DEMO · simulated data" badge. The real site and its data
# are never touched: own data folder, own secrets, own port, no SMS/WhatsApp keys. Run as root:
#   bash /root/sankalp-ai/deploy/demo-site.sh demo.172-128-32-35.sslip.io     # works with no DNS change
#   bash /root/sankalp-ai/deploy/demo-site.sh demo.sankalpai.app              # after adding an A record for "demo"
# Re-run any time to reset the demo to fresh data (new demo PIN). Remove: bash deploy/demo-site.sh --remove
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_ENV=/etc/sankalp/sankalp.env
ENV=/etc/sankalp/sankalp-demo.env
DATA=/var/lib/sankalp-demo
SITE=/etc/caddy/sites/sankalp-demo.caddy
PORT=5001

if [ "${1:-}" = "--remove" ]; then
  systemctl disable --now sankalp-demo 2>/dev/null || true
  rm -f /etc/systemd/system/sankalp-demo.service "$SITE" "$ENV"; rm -rf "$DATA"
  systemctl daemon-reload; systemctl reload caddy || true
  echo "✓ Demo site removed. The real site was not touched."; exit 0
fi
HOST="${1:?usage: bash deploy/demo-site.sh <demo host, e.g. demo.172-128-32-35.sslip.io>}"
[ -f "$MAIN_ENV" ] && [ -f /opt/sankalp/server_dist/index.mjs ] || { echo "✗ Install the main site first (deploy/oracle-free.sh)"; exit 1; }

# 1. Own settings: copy the main file without any messaging keys or admin bootstrap, then demo-only values.
install -d -m 0750 -o root -g sankalp /etc/sankalp
grep -vE '^(STORAGE_DRIVER=|DATABASE_URL=|PG[A-Z]*=|MSG91_|SMS_|DLT_|WHATSAPP_|INBOUND_SMS_|BOOTSTRAP_|PORT=|DATA_DIR=|DEMO_MODE=|PUBLIC_BASE_URL=|CORS_ORIGINS=|JWT_SECRET=|DEPT_JWT_SECRET=|EVIDENCE_ENC_KEY=|AI_TRAINING_)' "$MAIN_ENV" > "$ENV.tmp"
{
  echo "PORT=$PORT"; echo "HOST=127.0.0.1"; echo "DATA_DIR=$DATA"; echo "DEMO_MODE=true"
  echo "PUBLIC_BASE_URL=https://$HOST"; echo "CORS_ORIGINS=https://$HOST"
  echo "SMS_DRIVER=console"; echo "WHATSAPP_DRIVER=console"
  echo "JWT_SECRET=$(openssl rand -hex 32)"; echo "DEPT_JWT_SECRET=$(openssl rand -hex 32)"; echo "EVIDENCE_ENC_KEY=$(openssl rand -hex 32)"
} >> "$ENV.tmp"
install -m 0640 -o root -g sankalp "$ENV.tmp" "$ENV"; rm -f "$ENV.tmp"

# 2. Own service (same hardening as the main one, its own data folder).
sed -e "s#^Description=.*#Description=SANKALP AI demo site (simulated data)#" \
    -e "s#^EnvironmentFile=.*#EnvironmentFile=$ENV#" \
    -e "s#^ReadWritePaths=.*#ReadWritePaths=$DATA#" "$SRC/deploy/sankalp.service" > /etc/systemd/system/sankalp-demo.service
systemctl daemon-reload
systemctl stop sankalp-demo 2>/dev/null || true

# 3. Fresh demo data (every record flagged demo; placeholder phone numbers 90000 0000x).
rm -rf "$DATA"; install -d -o sankalp -g sankalp -m 0750 "$DATA"
cd /opt/sankalp
TSX=/opt/sankalp/node_modules/.bin/tsx; [ -x "$TSX" ] || TSX="$SRC/node_modules/.bin/tsx"
[ -x "$TSX" ] || (cd "$SRC" && npm ci --no-audit --no-fund >/dev/null)
# Same settings parser as the service itself (systemd EnvironmentFile), run as the locked-down app user.
systemd-run --quiet --wait --pipe --collect -p User=sankalp -p Group=sankalp -p WorkingDirectory=/opt/sankalp \
  -p EnvironmentFile="$ENV" -p ReadWritePaths="$DATA" "$TSX" scripts/seed-demo.ts > /dev/null
[ -f "$DATA/snapshot.json" ] || { echo "✗ Demo data was not created"; exit 1; }
systemctl enable --now sankalp-demo
for _ in $(seq 1 60); do curl -fsS "http://127.0.0.1:$PORT/readyz" >/dev/null 2>&1 && break; sleep 1; done

# 4. HTTPS for the demo address (kept across main-site upgrades: oracle-free.sh imports /etc/caddy/sites/*.caddy).
install -d /etc/caddy/sites
printf '%s {\n  encode gzip\n  request_body {\n    max_size 25MB\n  }\n  reverse_proxy 127.0.0.1:%s {\n    flush_interval -1\n  }\n}\n' "$HOST" "$PORT" > "$SITE"
grep -q '^import /etc/caddy/sites/\*.caddy' /etc/caddy/Caddyfile || printf '\nimport /etc/caddy/sites/*.caddy\n' >> /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

demo_ok=$(curl -fsS "http://127.0.0.1:$PORT/api/public/config" | python3 -c "import json,sys;print(json.load(sys.stdin).get('demoMode'))" 2>/dev/null || echo "?")
echo
[ "$demo_ok" = "True" ] && echo "✓ Demo site running: https://$HOST  (DEMO badge on every screen; certificate can take a minute)" || { echo "✗ Demo site did not start: journalctl -u sankalp-demo -n 40"; exit 1; }
echo "  App: choose the state 'Uttarakhand' (the demo city is Dehradun)."
echo "  Demo sign-ins (placeholder numbers, demo only):"
sed -n '2,6p' "$DATA/demo-credentials.txt" | sed 's/^/    /'
echo "  Police control room: https://$HOST/web/pcr → Uttarakhand → Admin phone + PIN with the Super admin number above."
echo "  Reset to fresh demo data: run this again.  Remove: bash $SRC/deploy/demo-site.sh --remove"

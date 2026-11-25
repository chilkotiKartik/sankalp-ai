#!/usr/bin/env bash
# Auto-update: the server follows GitHub `main` by itself (D-063). Install once, as root:
#   bash /root/sankalp-ai/deploy/auto-update.sh install sankalpai.app
# After that, every change merged into `main` is live within ~5 minutes — no more manual deploy commands.
#   bash /root/sankalp-ai/deploy/auto-update.sh status      # last runs
#   bash /root/sankalp-ai/deploy/auto-update.sh now         # update right away
#   bash /root/sankalp-ai/deploy/auto-update.sh uninstall
# Each run: fetch main → if it moved, merge (fast-forward only) → deploy → health check. If the new version is not
# healthy, the previous commit is restored and deployed again, so the site keeps running.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
LOG=/var/log/sankalp-auto-update.log
CONF=/etc/sankalp/auto-update.conf
BAD="${AUTO_UPDATE_BAD:-/var/lib/sankalp-auto-update.bad}"

run() {
  export HOME=/root
  # shellcheck disable=SC1090
  . "$CONF"
  cd "$SRC"
  exec 9>/run/sankalp-auto-update.lock; flock -n 9 || exit 0   # one run at a time
  git fetch -q origin main
  local cur new; cur=$(git rev-parse HEAD); new=$(git rev-parse FETCH_HEAD)
  [ "$cur" = "$new" ] && [ "${1:-}" != force ] && exit 0
  # A commit that already failed its health check is not retried every 5 minutes; the next fix on main is.
  [ "$(cat "$BAD" 2>/dev/null)" = "$new" ] && [ "${1:-}" != force ] && exit 0
  echo "$(date -Is) updating ${cur:0:7} → ${new:0:7}"
  if ! git -c user.name=deploy -c user.email=deploy@localhost merge -q --ff-only FETCH_HEAD 2>/dev/null; then
    git -c user.name=deploy -c user.email=deploy@localhost merge -q --no-edit FETCH_HEAD || { git merge --abort 2>/dev/null; echo "$(date -Is) ✗ merge failed, staying on ${cur:0:7}"; exit 1; }
  fi
  deploy() { SKIP_PLACES=1 bash "$SRC/deploy/oracle-free.sh" "$DOMAIN" >/dev/null 2>&1; }
  healthy() { for _ in $(seq 1 "${HEALTH_TRIES:-90}"); do curl -fsS "${HEALTH_URL:-http://127.0.0.1:5000/readyz}" >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }
  if deploy && healthy; then
    echo "$(date -Is) ✓ live on ${new:0:7}"
  else
    echo "$(date -Is) ✗ ${new:0:7} not healthy — rolling back to ${cur:0:7}"
    echo "$new" > "$BAD"
    git reset -q --hard "$cur"; deploy; healthy && echo "$(date -Is) ✓ back on ${cur:0:7}" || echo "$(date -Is) ✗ rollback not healthy — check: journalctl -u sankalp -n 50"
  fi
}

case "${1:-}" in
  install)
    DOMAIN="${2:?usage: auto-update.sh install <your-domain>}"
    install -d -m 0750 /etc/sankalp
    printf 'DOMAIN=%q\n' "$DOMAIN" > "$CONF"
    cat > /etc/systemd/system/sankalp-auto-update.service <<UNIT
[Unit]
Description=SANKALP AI: follow GitHub main
After=network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash $SRC/deploy/auto-update.sh run
StandardOutput=append:$LOG
StandardError=append:$LOG
TimeoutStartSec=1800
UNIT
    cat > /etc/systemd/system/sankalp-auto-update.timer <<UNIT
[Unit]
Description=SANKALP AI: check for updates every 5 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true
[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload
    systemctl enable --now sankalp-auto-update.timer
    echo "✓ Auto-update on for https://$DOMAIN — checks GitHub main every 5 minutes. Updating now…"
    bash "$0" run force && tail -3 "$LOG"
    ;;
  run) shift; run "${1:-}" ;;
  now) systemctl start sankalp-auto-update.service; tail -5 "$LOG" ;;
  status) systemctl list-timers sankalp-auto-update.timer --no-pager | head -3; echo; tail -10 "$LOG" 2>/dev/null || echo "no runs yet" ;;
  uninstall) systemctl disable --now sankalp-auto-update.timer; rm -f /etc/systemd/system/sankalp-auto-update.{service,timer} "$CONF"; systemctl daemon-reload; echo "✓ auto-update off" ;;
  *) echo "usage: $0 install <domain> | now | status | uninstall"; exit 1 ;;
esac

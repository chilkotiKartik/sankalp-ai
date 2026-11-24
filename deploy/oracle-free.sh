#!/usr/bin/env bash
# Free, always-on hosting in India: Oracle Cloud "Always Free" VM in Mumbai or Hyderabad (D-053).
# Never sleeps, keeps data on its own disk, HTTPS included. Run on a fresh Ubuntu 24.04 VM, as root,
# from a checkout of this repository:
#
#   sudo bash deploy/oracle-free.sh 140.238.1.2          # the VM's public IP: uses https://140-238-1-2.sslip.io (no domain needed)
#   sudo bash deploy/oracle-free.sh sankalp.example.in   # your own domain (point its A record at the VM first)
# sslip.io only answers DNS for the name; no app traffic or data goes through it. Use your own domain for launch.
#
# Re-running it upgrades the app and keeps data, secrets and the certificate.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo bash deploy/oracle-free.sh"; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"

ARG="${1:?usage: sudo bash deploy/oracle-free.sh <public-ip | your-domain>  (public IP is on the Oracle instance page)}"
if [[ "$ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then DOMAIN="$(echo "$ARG" | tr . -).sslip.io"; else DOMAIN="$ARG"; fi
echo "Setting up SANKALP at https://$DOMAIN"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y build-essential python3 rsync curl openssl iptables-persistent caddy

# 1. Swap (the 1 GB micro shape needs it to build; harmless on the 24 GB ARM shape).
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# 2. Oracle's Ubuntu image blocks every port except SSH in iptables. Open 80 and 443 (also open them
#    in the VCN Security List in the Oracle console, see docs/DEPLOYMENT.md).
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
done
netfilter-persistent save

# 3. Police stations, hospitals and fire stations for every state (OpenStreetMap, public data, build time only).
#    Skipped when config/places is already built; takes 20-60 minutes the first time.
if ! ls "$SRC"/config/places/*.json >/dev/null 2>&1 && [ "${SKIP_PLACES:-0}" != 1 ]; then
  python3 -I "$SRC/scripts/build-places.py" --fetch /var/tmp/sankalp-osm && python3 -I "$SRC/scripts/build-places.py" /var/tmp/sankalp-osm/india.tsv \
    || echo "! Station download failed (OpenStreetMap busy). The app runs without it; re-run this script later."
fi

# 4. The app itself (Node 22, locked-down user, systemd, generated secrets).
bash "$SRC/deploy/install-onprem.sh" --no-start
ENV=/etc/sankalp/sankalp.env
set_env() { grep -q "^$1=" "$ENV" && sed -i "s|^$1=.*|$1=$2|" "$ENV" || echo "$1=$2" >> "$ENV"; }
set_env PUBLIC_BASE_URL "https://$DOMAIN"
set_env CORS_ORIGINS "https://$DOMAIN"
set_env TRUST_PROXY 1
# Official news (All India Radio, PIB). Add api.sarvam.ai here once you have a Sarvam key.
grep -q "^EGRESS_ALLOWLIST=." "$ENV" || set_env EGRESS_ALLOWLIST "newsonair.gov.in,www.pib.gov.in,sachet.ndma.gov.in"
systemctl enable sankalp
systemctl restart sankalp

# 5. HTTPS with an automatic Let's Encrypt certificate.
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  encode gzip
  request_body {
    max_size 25MB
  }
  reverse_proxy 127.0.0.1:5000 {
    flush_interval -1
  }
}
CADDY
# Own domain: www.<domain> redirects to the main address (needs an A record for www too).
if [ "$DOMAIN" = "$ARG" ] && [[ "$DOMAIN" != www.* ]] && getent hosts "www.$DOMAIN" >/dev/null; then
  printf 'www.%s {\n  redir https://%s{uri} permanent\n}\n' "$DOMAIN" "$DOMAIN" >> /etc/caddy/Caddyfile
fi
systemctl enable caddy && systemctl reload caddy || systemctl restart caddy

# 6. Daily encrypted backup at 02:30, 14 days kept (passphrase generated once; copy it to your password manager).
install -d -m 0700 /var/backups/sankalp
if [ ! -f /etc/sankalp/backup.pass ]; then openssl rand -hex 32 > /etc/sankalp/backup.pass; chmod 0600 /etc/sankalp/backup.pass; fi
cat > /etc/cron.d/sankalp-backup <<CRON
30 2 * * * root BACKUP_PASSPHRASE=\$(cat /etc/sankalp/backup.pass) BACKUP_DIR=/var/backups/sankalp DATA_DIR=/var/lib/sankalp bash /opt/sankalp/scripts/backup.sh >/dev/null 2>&1 && find /var/backups/sankalp -mtime +14 -delete
CRON

for i in $(seq 1 60); do curl -fsS http://127.0.0.1:5000/readyz >/dev/null 2>&1 && break; sleep 1; done
echo
echo "✓ SANKALP is running: https://$DOMAIN  (certificate can take a minute on first run)"
echo "  Secrets:  /etc/sankalp/sankalp.env and /etc/sankalp/backup.pass  (copy both to a password manager)"
echo "  Department codes (first boot only): /var/lib/sankalp/dept-codes.initial.txt"
echo "  Upgrade later:  cd $(basename "$SRC") && git pull && sudo bash deploy/oracle-free.sh $ARG"

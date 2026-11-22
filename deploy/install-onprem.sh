#!/usr/bin/env bash
# One-command install on an Ubuntu 22.04/24.04 VM in an Indian region or the State Data Centre (P7.2).
# Usage (as root, from a checkout of the repository):  sudo bash deploy/install-onprem.sh [--no-start]
#   --no-start  install but do not start (for a disaster-recovery restore: restore the data first, then start)
# Idempotent: re-running upgrades the code and keeps /etc/sankalp/sankalp.env and /var/lib/sankalp.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
NO_START=0; [ "${1:-}" = "--no-start" ] && NO_START=1

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update && apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
id sankalp >/dev/null 2>&1 || useradd --system --home /opt/sankalp --shell /usr/sbin/nologin sankalp
install -d -o sankalp -g sankalp -m 0750 /var/lib/sankalp /opt/sankalp
install -d -m 0750 /etc/sankalp

# Anchored excludes (review P7-1): only the top-level folders, never server/data/.
rsync -a --delete --exclude /node_modules --exclude /.git --exclude /data --exclude /backups "$SRC/" /opt/sankalp/
cd /opt/sankalp
npm ci
npm run server:build
chown -R sankalp:sankalp /opt/sankalp

if [ ! -f /etc/sankalp/sankalp.env ]; then
  cat > /etc/sankalp/sankalp.env <<ENV
NODE_ENV=production
PORT=5000
HOST=127.0.0.1
DATA_DIR=/var/lib/sankalp
JWT_SECRET=$(openssl rand -hex 32)
DEPT_JWT_SECRET=$(openssl rand -hex 32)
EVIDENCE_ENC_KEY=$(openssl rand -hex 32)
PUBLIC_BASE_URL=https://sankalp.example.gov.in
EGRESS_ALLOWLIST=
DEFAULT_TENANT=uttarakhand
ENV
  chmod 0600 /etc/sankalp/sankalp.env
  echo "Created /etc/sankalp/sankalp.env — copy EVIDENCE_ENC_KEY and the secrets to the state's password manager NOW."
fi

install -m 0644 deploy/sankalp.service /etc/systemd/system/sankalp.service
systemctl daemon-reload
if [ "$NO_START" = 1 ]; then systemctl enable sankalp; echo "Installed, not started (--no-start). Restore data, chown -R sankalp:sankalp /var/lib/sankalp, then: systemctl start sankalp"; exit 0; fi
systemctl enable --now sankalp
for i in $(seq 1 60); do curl -fsS http://127.0.0.1:5000/readyz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:5000/readyz && echo && echo "✓ SANKALP is running on 127.0.0.1:5000. Put deploy/nginx-sankalp.conf in front for TLS."

#!/usr/bin/env bash
# Self-host Patram-7B (BharatGen) on your own GPU server in India and connect it to SANKALP (D-057).
# Needs: Ubuntu 22.04/24.04 GPU VM in an Indian region (one NVIDIA GPU with ≥ 24 GB, e.g. L4/A10/A100) with the
# NVIDIA driver installed, and a Hugging Face token from an account that accepted the model's terms at
# https://huggingface.co/bharatgenai/patram-7b-instruct (the model is gated; licence Apache-2.0).
#
#   sudo HF_TOKEN=hf_... bash deploy/gpu/setup-patram.sh <this-gpu-server-public-ip> <sankalp-server-ip>
#
# Result: https://<ip-with-dashes>.sslip.io/v1/chat/completions, reachable only from the SANKALP server, with a
# generated API key. The weights (~15 GB) are downloaded once; nothing else leaves this machine.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
GPU_IP="${1:?usage: setup-patram.sh <gpu-public-ip> <sankalp-server-ip>}"; APP_IP="${2:?sankalp server ip required}"
: "${HF_TOKEN:?set HF_TOKEN (Hugging Face token of an account that accepted the Patram-7B terms)}"
command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || { echo "No NVIDIA driver found — install it first"; exit 1; }
SRC="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="$(echo "$GPU_IP" | tr . -).sslip.io"

export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get install -y python3-venv python3-pip caddy ufw
id patram >/dev/null 2>&1 || useradd --system --home /opt/patram --shell /usr/sbin/nologin patram
install -d -o patram -g patram /opt/patram
python3 -m venv /opt/patram/venv
/opt/patram/venv/bin/pip install --upgrade pip
/opt/patram/venv/bin/pip install torch "transformers>=4.46" accelerate fastapi "uvicorn[standard]" pillow huggingface_hub
HF_TOKEN="$HF_TOKEN" /opt/patram/venv/bin/huggingface-cli download bharatgenai/patram-7b-instruct --local-dir /opt/patram/model
install -m 0644 "$SRC/patram_server.py" /opt/patram/patram_server.py
chown -R patram:patram /opt/patram

if [ ! -f /etc/patram.env ]; then
  printf 'PATRAM_MODEL_DIR=/opt/patram/model\nPATRAM_API_KEY=%s\nHF_HUB_OFFLINE=1\n' "$(openssl rand -hex 32)" > /etc/patram.env
  chmod 0600 /etc/patram.env
fi
cat > /etc/systemd/system/patram.service <<UNIT
[Unit]
Description=Patram-7B vision server for SANKALP
After=network-online.target
[Service]
User=patram
WorkingDirectory=/opt/patram
EnvironmentFile=/etc/patram.env
ExecStart=/opt/patram/venv/bin/uvicorn patram_server:app --host 127.0.0.1 --port 8000
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now patram

# HTTPS in front; only the SANKALP server may connect (plus SSH).
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  @notapp not remote_ip $APP_IP
  respond @notapp 403
  request_body {
    max_size 15MB
  }
  reverse_proxy 127.0.0.1:8000
}
CADDY
systemctl restart caddy
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow from "$APP_IP" to any port 443 proto tcp && ufw --force enable

echo "Waiting for the model to load (first start takes a few minutes)…"
for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1 && break; sleep 5; done
curl -fsS http://127.0.0.1:8000/health && echo
echo "✓ Patram is ready at https://$DOMAIN/v1 (only $APP_IP can reach it)."
echo "  1. On THIS machine, read the key:   sudo grep PATRAM_API_KEY /etc/patram.env"
echo "  2. On the SANKALP server, run:       bash /root/sankalp-ai/deploy/set-keys.sh patram https://$DOMAIN/v1 <that key>"
echo "  Never paste the key into chat, issues or git."

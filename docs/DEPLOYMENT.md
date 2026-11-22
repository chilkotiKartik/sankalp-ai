# Deploying SANKALP AI

This replaces `DEPLOY.md`, `DEPLOYMENT_GUIDE.md`, `DEPLOY_RAILWAY.md`, `EXPO_GO_DEPLOYMENT.md` and `replit.md` (m8). Mobile builds are covered in [MOBILE_BUILD.md](MOBILE_BUILD.md).

> **Data residency:** production must run on Indian infrastructure (a MeitY-empanelled cloud region in India, or a State Data Centre). See [`DATA_RESIDENCY.md`](../DATA_RESIDENCY.md).

## 1. Requirements
- Node.js 22 (`.node-version`), npm 10.
- Persistent disk for `DATA_DIR` (snapshot, uploads, private evidence). Phase 1 moves to PostgreSQL and S3-compatible storage.
- A reverse proxy terminating TLS (nginx/Caddy/cloud load balancer). Set `TRUST_PROXY` to the number of proxy hops.

## 2. Configure
Copy `.env.example` to `.env` (or set the variables in the platform's secret store). Required:

```bash
JWT_SECRET=$(openssl rand -hex 32)
DEPT_JWT_SECRET=$(openssl rand -hex 32)
```

For production also set `NODE_ENV=production`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `MAP_TILE_URL` and, optionally, `SARVAM_API_KEY` or `AI_TEXT_BASE_URL` / `AI_VISION_BASE_URL` (add their hosts to `EGRESS_ALLOWLIST`). The server validates everything at boot and exits with a clear message if something is wrong.

First state administrator (one-time; unset afterwards):
```bash
BOOTSTRAP_SUPER_ADMIN_PHONE=<10 digits> BOOTSTRAP_SUPER_ADMIN_PIN=<6 digits>
```

## 3. Build and run
```bash
npm ci
```
```bash
npm run expo:static:build
```
```bash
npm run server:build
```
```bash
npm run server:prod
```
On first boot, department access codes are written once to `DATA_DIR/dept-codes.initial.txt` (mode 0600). Distribute them securely, then delete the file. Rotate a code at any time with `POST /api/superadmin/departments/:id/rotate-code`.

Health checks: `GET /healthz` (liveness) and `GET /api/health`.

## 4. Platforms

### Indian cloud VM (MeitY-empanelled) or State Data Centre — recommended for production
One command on Ubuntu 22.04/24.04, from a checkout of this repository:
```bash
sudo bash deploy/install-onprem.sh
```
It installs Node 22 if needed and creates a locked-down `sankalp` system user. It builds the server and writes `/etc/sankalp/sankalp.env` with freshly generated secrets (first run only). It then installs the hardened systemd unit (`deploy/sankalp.service`) and waits for `/readyz`. Re-running it upgrades the code and keeps your data and secrets. Put `deploy/nginx-sankalp.conf` in front for TLS (it is SSE/WebSocket aware and allows 25 MB uploads).

No outbound internet is needed beyond the hosts you allow in `EGRESS_ALLOWLIST`, and none are required: AI falls back to the rules engine and photos to manual review. Docker Compose and Helm were deliberately not built (DECISIONS D-024). The systemd install is the supported on-premise path.

### Azure (Azure for Students) — the current live pilot
Live at **https://sankalpai.app** (since 2026-11-22; `www.sankalpai.app` redirects there, DNS A records → `172.128.32.35`): VM `sankalp-vm` in resource group `sankalp-rg`, region **South Central India** (`indiasouthcentral`, Hyderabad). The Azure for Students policy allows only a few regions, and this is the Indian one. Size **Standard_B2ats_v2** (2 vCPU, 1 GB RAM, covered by the 12-month free services), 64 GB Premium SSD, Ubuntu 24.04, ports 22/80/443 open.

Set up with the same script as Oracle:
```bash
sudo bash deploy/oracle-free.sh sankalpai.app
```
Upgrade from your laptop with the Azure CLI (no SSH needed):
```bash
az vm run-command invoke -g sankalp-rg -n sankalp-vm --command-id RunShellScript --scripts "cd /root/sankalp-ai && git pull -q && SKIP_PLACES=1 bash deploy/oracle-free.sh sankalpai.app | tail -3"
```
To log in yourself, use Azure portal → `sankalp-vm` → **Reset password**, add your own SSH public key for user `azureuser`, then `ssh azureuser@172.128.32.35`. Keep the public IP static: the domain's A records point at it.

### Oracle Cloud Always Free, Mumbai or Hyderabad — free, always on, in India (recommended for pilots)
Oracle's Always Free tier gives a VM that never sleeps and keeps its disk. The Ampere ARM shape has up to 4 cores, 24 GB RAM and 200 GB of disk. Data stays in India because the VM runs in an Indian region (D-053).

1. Sign up at cloud.oracle.com and choose **India West (Mumbai)** or **India South (Hyderabad)** as the home region. The home region cannot be changed later. A card is asked for to verify identity; Always Free resources are not charged.
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 24.04**.
   - Shape: **VM.Standard.A1.Flex** (Ampere ARM), 2–4 OCPU and 12–24 GB RAM. If ARM capacity is unavailable, use **VM.Standard.E2.1.Micro**; the script adds swap.
   - Add your SSH key and keep the public IP.
3. **Networking → your VCN → Security List → Add ingress rules** for TCP 80 and 443 from `0.0.0.0/0`.
4. SSH in (`ssh ubuntu@<public-ip>`), then:
```bash
git clone https://github.com/chilkotiKartik/sankalp-ai.git && cd sankalp-ai
```
```bash
sudo bash deploy/oracle-free.sh <public-ip>
```
The app is then live at `https://<ip-with-dashes>.sslip.io` with a free HTTPS certificate. With your own domain, point its A record at the IP and pass the domain instead of the IP. The script installs Caddy for HTTPS, opens the VM firewall, adds swap and sets up a daily encrypted backup to `/var/backups/sankalp`, kept for 14 days. Re-run it after `git pull` to upgrade; data and secrets are kept.

5. Rebuild the Android app against the new address (`EXPO_PUBLIC_DOMAIN=<your-domain>`, see MOBILE_BUILD.md). The current APK points at Render.

### Render (current pilot hosting — not in India)
`render.yaml` is the blueprint for the live service: web service with a 10 GB persistent disk at `DATA_DIR`, health check `/healthz`, generated JWT secrets. **It has no automatic off-site backup:** Render disks attach to one service, so a cron service cannot read them. Render has no Indian region either. Keep it for pilots and demos, and use the install above (where `scripts/backup.sh` runs from cron) for production data.
- **Build:** `npm ci && npm run expo:static:build && npm run server:build`
- **Start:** `npm run server:prod`
- Add a **persistent disk** mounted at `DATA_DIR`. Without one, data is lost on every restart or sleep.
- Set the secrets in the dashboard. Choose an Indian region if the platform offers one; otherwise use it for demos only.

## 5. Demo instance
See [`DEMO.md`](../DEMO.md): `DEMO_MODE=true npm run seed:demo`, start the server, then `npm run smoke`.

## 6. Verify a deployment
```bash
SMOKE_BASE_URL=https://your-host SMOKE_PWD_CODE=... SMOKE_POLICE_CODE=... npm run smoke
```
The smoke test creates one placeholder citizen, complaint and SOS. Run it against staging, not live production.

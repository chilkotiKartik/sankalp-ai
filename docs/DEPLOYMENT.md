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

### Indian cloud VM / container (recommended)
Any Linux VM in an Indian region. Run the steps above under systemd or a container, mount `DATA_DIR` on a persistent volume, and put nginx or Caddy in front for TLS. Docker Compose and a Helm chart arrive with Phase 7.2.

### On-premise State Data Centre
The same as above, with no outbound internet needed except the hosts you allow in `EGRESS_ALLOWLIST` (none are required: AI falls back to the rules engine and photos to manual review).

### Render / Railway (current pilot hosting — not in India by default)
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

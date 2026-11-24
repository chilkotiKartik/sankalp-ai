# Secrets to rotate (names and locations only — never values)

| Secret | Where it was exposed | Action |
|---|---|---|
| Seeded super-admin and district-admin phone/PIN pairs | `server/storage.ts` seed, `context/AuthContext.tsx` DEMO_USERS, `README.md` "Demo Credentials", git history | Removed from code in Phase 0. Any deployed instance that ran the old seed must be redeployed (in-memory data is wiped). Treat these accounts as compromised. |
| Department access codes `<dept>_2026` | `server/routes.ts` dept login, `server/web/dept.html` chips, README | Replaced by random bcrypt-hashed codes (M5). |
| Default `DEPT_JWT_SECRET` fallback string | `server/routes.ts` | Removed; the server now refuses to boot without a ≥32-character secret. Set new `JWT_SECRET` and `DEPT_JWT_SECRET` on every deployment. |
| Seeded CPR officer phone numbers | `server/storage.ts` PATROL_VANS_SEED | Real-looking numbers; replaced with placeholders in demo seed. |
| Live department access codes (all states: police, pwd, ulb, water, power, forest, health, usdma) | Pasted into an AI chat on 2026-11-23 (not in git) | Rotate on the server: `bash /root/sankalp-ai/deploy/rotate-dept-codes.sh` (rotates every state, signs out old sessions, prints no codes). |
| `SARVAM_API_KEY` | Pasted into an AI chat on 2026-11-23 (kept only in the git-ignored `.env`) | Create a new key on the Sarvam dashboard, delete the old one, then `set-keys.sh sarvam <new key>` on the server and update the local `.env`. |
- Bootstrap admin PIN shown in the chat on 2026-11-24 (never became active). Use `deploy/make-admin.sh` for a fresh PIN.

# Secrets to rotate (names and locations only — never values)

| Secret | Where it was exposed | Action |
|---|---|---|
| Seeded super-admin and district-admin phone/PIN pairs | `server/storage.ts` seed, `context/AuthContext.tsx` DEMO_USERS, `README.md` "Demo Credentials", git history | Removed from code in Phase 0. Any deployed instance that ran the old seed must be redeployed (in-memory data is wiped). Treat these accounts as compromised. |
| Department access codes `<dept>_2026` | `server/routes.ts` dept login, `server/web/dept.html` chips, README | Replaced by random bcrypt-hashed codes (M5). |
| Default `DEPT_JWT_SECRET` fallback string | `server/routes.ts` | Removed; the server now refuses to boot without a ≥32-character secret. Set new `JWT_SECRET` and `DEPT_JWT_SECRET` on every deployment. |
| Seeded CPR officer phone numbers | `server/storage.ts` PATROL_VANS_SEED | Real-looking numbers; replaced with placeholders in demo seed. |

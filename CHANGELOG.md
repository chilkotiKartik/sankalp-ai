# Changelog

## [Unreleased] — Phase 0: demo-safe hardening (2026-11-21)
### Security
- Server refuses to start without strong `JWT_SECRET` / `DEPT_JWT_SECRET`; no seeded or published admin credentials; random rotatable department codes.
- Every API route validated (zod), authorised and scoped; route-inventory test.
- SOS victim data delivered only to district staff, police and the victim (was broadcast to all users and to an unauthenticated stream).
- Police CPR/PCR consoles and APIs require police/USDMA or admin credentials.
- Uploads content-checked with size limits; SOS audio is private and access-audited.
- helmet, CORS allow-list, per-phone login limits; `node_modules` no longer served.
### Changed
- Complaint lifecycle state machine: officers submit proof, only the citizen can close; the 3rd rejection escalates.
- AI through a sovereign gateway (Sarvam / self-hosted / rules); photo checks fail closed to manual review.
- Data persisted as an atomic JSON snapshot (every 30 s and on shutdown).
### Removed
- OpenAI, Groq and NVIDIA integrations; fake predictions, random worker GPS (demo-only now), mock bills (demo-only), fake QR; fabricated news, stats and stock evidence photos.
### Added
- `npm run seed:demo`, `npm run smoke`, `npm run egress:audit`, `npm run secrets:scan`, `npm run migrate:pins`; `DEMO.md`; 79 automated tests.

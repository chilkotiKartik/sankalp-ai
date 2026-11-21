# Contributing

1. Read `CLAUDE.md` (project rules) and `docs/MASTER_PROMPT.md` (plan). Check `PROGRESS.md` for what is in flight.
2. Branch from the current development branch; one logical change per commit, message `[P<phase>.<task>] what changed`.
3. Every API route must go through `route()` in `server/lib/route.ts` with an auth level, a permission and zod schemas.
4. Never add a foreign network call: use `safeFetch()` and add Indian hosts to `EGRESS_ALLOWLIST` and `config/egress-allowlist.json`.
5. Never commit secrets, real phone numbers or real citizen data. Tests and fixtures use `90000xxxxx` placeholders.
6. Run the gate before pushing:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run egress:audit && npm run secrets:scan
   ```
   With a server running: `npm run smoke`.
7. Do not disable tests, add `@ts-ignore`, or loosen lint rules to make the gate pass.

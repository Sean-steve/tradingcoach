# TRADE OS — Repository Engineering Rules

## Canonical source
- **`main` is the authoritative repository branch.** Create short-lived feature/fix branches from `main` and merge via reviewed pull requests. Never force-push or rewrite published history.
- Project: independent React + TanStack Start + Vite + Nitro application using locally testable Supabase PostgreSQL/Auth/Storage.
- **No Lovable dependency or cloud project authority** remains. Historical Lovable notes under `.lovable/plan/` are archived material, not active instructions.
- The `feat/phase2-trading-financial-correctness` branch is an incompatible alternate and is retained only for reconciliation tracked by issue #8. Do not apply its schema.

## Dev / tests
1. `bun install --frozen-lockfile`
2. `bun run test && bun run typecheck && bun run build`
3. `bun run local:start` (starts isolated local Supabase) and `bun run local:verify`.
4. `bun run local:certify` for complete API and browser E2E (including real local DB writes).

All test data must be isolated to localhost. Never aim destructive tests, Supabase reset/push, fixtures, or local smoke routines at an external database.

## Security and money
- `.env.local` is ignored and generated from the local Supabase CLI. Only use `.env.example` as a committed template. Never commit privileged keys or prefix service role keys with `VITE_`.
- Supabase RLS is required for user-scoped tables and Storage. RLS is not a substitute for explicit account ownership in security-definer functions.
- Store authoritative binary settlements and monetary balance changes in database transactions. No client-side direct balance increments.
- Trading insights are observational and evidence-gated, not guaranteed forecasts, broker signals, automated trading, or verified external transfers.
- Consent and minimum-necessary data handling apply before connecting any remote AI provider.

## Release rules
- Do not label a workflow production-certified because a frontend build passes. Check `Foundation CI`, `Local Supabase Database Certification`, and `Phase C Full-System Local Certification` on the actual merged commit.
- Track exceptions; React warning follow-up is issue #9. Multi-currency/cash-movement reconciliation is issue #8.
- Local passing tests are **not** live broker, remote production, security-penetration, or DR certification.

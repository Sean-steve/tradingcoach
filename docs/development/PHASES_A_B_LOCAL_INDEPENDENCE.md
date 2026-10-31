# Phases A & B — Vendor Independence and Local Supabase

## Scope
- Replaced Lovable's Vite config with TanStack Start/Vite/Tailwind/Nitro plugins.
- Removed Lovable Cloud auth wrapper in favor of standard Supabase Auth Google OAuth (opt-in for local).
- Replaced Lovable AI Gateway with a provider-neutral OpenAI-compatible endpoint; offline deterministic coaching remains available without a provider.
- Removed Lovable-specific runtime package declarations and UI error hooks. Lovable legacy architectural plans remain archived as historical files only.
- Scrubbed tracked .env from its old hosted project reference; generated .env.local is gitignored.
- Isolated local Supabase project ID, localhost ports, Auth, Storage and Studio.
- Added reproducible start, reset, verification, development and environment scripts.
- Added pgTAP schema verification, two-user real-data smoke tests, and GitHub Actions Docker-based migration checks.
- Preserved all schema migrations for Phases 1–4, existing UI workflows and historical repository development.

## Non-goals
- Does not migrate or download historical cloud users/trades (inaccessible).
- Does not connect to the AGENCY OS project.
- Does not deploy to Contabo or production.
- Does not claim compliance or financial production certification until migrations and E2E tests have passed in staging.
- Does not turn TRADE OS into an automated trade execution platform.

## Security
Local environment secrets live in ignored .env.local, generated from local CLI. Developer may replace it by rerunning local env generation. Never commit the service role/secret key or attach the project to the remote Supabase instance without authorization. Test script enforces local hostname.

## Certification
1. `bun install --frozen-lockfile`.
2. `bun run build && bun run typecheck && bun run test`.
3. `supabase start` and apply all migrations.
4. `supabase test db` and assert all phase tables/functions and RLS.
5. Local two-user API tests: auth, account ownership, binary settlement, exactly-once balance, duplicate CSV protection, pending queue, goals, reward funding and denial of unearned redemption.
6. Manual browser verification at localhost; account dashboard, trade, import, coach, goals, rewards.
7. Do not merge stacked Phase 4 work into main until predecessor PRs are reconciled.

## Notes
The CI runner has Docker; the current assistant execution container does not, so direct local Docker testing here is unavailable. CI is the source of executed migration/test results. This phase is ready for local workstation use only after CI succeeds; do not label it verified beforehand.

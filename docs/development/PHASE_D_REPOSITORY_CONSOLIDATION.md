# TRADE OS — Phase D: Canonical Repository Consolidation
Date: 2026-10-31

## Objective

Make `main` the authoritative and reproducibly tested branch for TRADE OS v2. Replace stacked draft PRs with a linear integration policy; preserve code history, prevent incompatible financial schemas, and remove obsolete vendor authority.

## Canonical dependency order

| PR | Domain | Integration |
|---|---|---|
| [#3](../../pull/3) | Phase 2: trading & financial correctness | Merge into `main` |
| [#4](../../pull/4) | Phase 3: adaptive coaching | Retarget to `main` after #3, then merge |
| [#5](../../pull/5) | Phase 4: goals, lifestyle rewards | Retarget after #4, then merge |
| [#6](../../pull/6) | Phases A/B: independent Vite/Nitro, local Supabase | Retarget after #5, then merge |
| [#7](../../pull/7) | Phase C: local API/browser certification | Merge **only after** full local certification passes |
| Phase D consolidation | AGENTS, security hygiene, CI main gates, docs | Merge after #7 |

Preserve original merge commits. No forced branch updates, history rewrites or automatic cloud migrations. Do not delete historical branches while any migration reconciliation or review is outstanding.

## Superseded alternate (PR #2)

PR [#2](../../pull/2), branch `feat/phase2-trading-financial-correctness`, contains a **separate and incompatible Phase 2 financial contract**, including `instrument_type=binary_option`, different expiry/payout column names, and another monetary trigger. The canonical implementation uses `contract_type=binary`, `expires_at`, `payout_percent`, `binary_outcome`.

Do not merge or apply the alternate `20261030210000_phase2_trading_financial.sql`. Its useful *distinct* features—per-account currencies, cash movement ledger, cash reconciliation, cent-accurate allocation and import-run audit—are preserved as a source branch and tracked in [issue #8](../../issues/8). They are **not** certified as delivered on `main`.

## Reliability, tests, and environments

- App: React 19 + TanStack Start + Nitro + TypeScript; all runtime Lovable dependencies removed.
- Database: independent Supabase/PostgreSQL/Auth/Storage, isolated local project `trade-os-local`; never switch test targets to a hosted project.
- Secrets: keep only `.env.example` committed. `.env.local` and `.env` are ignored. The historical tracked `.env` is removed from current branch (not rewritten in git history).
- CI on PR **and** pushes to `main`: Foundation unit/build/types, local Supabase/pgTAP/API, and full local Chromium UI certification. Concurrency cancels superseded revisions of a PR rather than running stale checks in parallel.
- CI results must correspond to the actual merge commit for a final integrated certificate.
- Phase C emits a single known React state-update console warning in browser tests; this is explicitly tracked in [issue #9](../../issues/9) and *temporarily* allowlisted without exempting uncaught page exceptions or other console errors.
- Local test success is not authorization to claim production certification. Historical broker data, live keys, AI providers, payment transfers, performance and disaster recovery remain unverified.

## Developer workflow

```bash
git switch main && git pull --ff-only origin main
bun install --frozen-lockfile
bun run test && bun run typecheck && bun run build
bun run local:start
bun run local:verify
bun run local:certify
```

App at `http://127.0.0.1:8080`; local Studio at `http://127.0.0.1:54323`.

No `supabase link`, `supabase db push`, automatic remote backfill, or existing portfolio mutation occurs in this phase.

## Exit criteria

1. PRs #3–#7 merged into `main` in order with original history preserved.
2. Obsolete PR #2 closed but source branch/issue retained.
3. Main contains independent runtime, all tracked canonical migrations, end-to-end tests, correct private Storage bucket and financial accounting trigger fix.
4. Main branch runs all three CI gates and reports their actual pass/fail status.
5. No tracked credentials, no active Lovable instructions, single documented source of truth.
6. Open issues #8 and #9 transparently recorded as exceptions—not silently described as complete.

**Next planned stage:** Phase E — Automation & Production Readiness, *after* approved remote infrastructure and financial reconciliation scope. Phase E does not turn this discipline-first system into an automated trading bot.

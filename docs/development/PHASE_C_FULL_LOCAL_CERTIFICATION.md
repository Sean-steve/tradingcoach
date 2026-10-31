# TRADE OS v2 — Phase C Full-System LOCAL Certification

## Purpose and boundary
Verify the independent TRADE OS application and all previous Phase 1–4 changes against disposable, realistic **local PostgreSQL, GoTrue, PostgREST and Storage**, exercising the real HTTP API and actual React UI. All generated users, trades, insights and rewards belong to the isolated local test database. No demo data is shipped in the application runtime.

**Not** a remote production certification, and not proof of supported broker API interoperability or independently verified financial deposits. No remote project is contacted.

## Test layers

| Layer | Entrypoint | What is verified |
|---|---|---|
| Domain unit | `bun run test` | 30 regression tests, money math, coaching evidence gates, goal/reward calculators |
| Type/build | `bun run typecheck`, `bun run build` | React/Start/Nitro build independent of Lovable |
| Schema | `supabase test db` | 17 pgTAP assertions for migrations and RLS |
| Service/API | `node scripts/local/certify-api.mjs` | Two users, account ownership, journal accounting, repeated financial corrections, atomic CSV imports, intelligence queue, TOM pinning, decision quality, audited recommendation actions, idempotent guardrails, goals, rewards and final P&L-to-account reconciliation |
| Browser | `node scripts/local/certify-browser.mjs` | Auth, protected routes, all 28 main screens, real trade logging, CSV import/dedup, goal and reward creation, offline coach persistence, selected-account trade isolation |

The custom browser runner uses **pinned temporary Playwright 1.56.1** and headless Chromium in CI. It tests the actual backend—not route intercepts, mocked API responses or static screenshots.

## Verification on a developer laptop

```bash
bun install --frozen-lockfile
bun run local:start
bun run local:certify
```

The runner refuses non-local database URLs; it creates unique users and financial records, then verifies behavior using Supabase client access. Failed browser steps save a screenshot to `artifacts/phase-c/`. You can reset *only* local test data with `bun run local:reset`.

## Security and financial correctness gates

1. Signup provisions isolated profile and account.
2. Spot P&L insert, update, move and delete apply net deltas exactly once; new account balances cannot be forged.
3. Binary pending, winning, losing and fully refunded settlement never invent gross profit.
4. CSV batch failure rolls back all rows; repeat import inserts zero duplicates.
5. Cross-user read/write attempts fail or return no affected rows under RLS.
6. Manual versions remain linked to audit trades; process scores do not depend on profit.
7. Only evidence-backed current recommendations can be accepted/activated; action audit records transitions and guardrail activation is idempotent.
8. Reward planning denies demo trading, gross over-allocation, unverified redemption, excess self-reports and cross-user access.
9. Final stored account balance matches starting capital plus net P&L of closed journal records.
10. Browser authentication, all core screens and actual persisted workflows pass.

## Acceptance rules

- **LOCAL GO** requires all the aforementioned CI checks to pass on one complete commit.
- Any failing test constitutes a defect; fix and rerun rather than weakening the assertion.
- Browser tests fail on unhandled page exceptions and preserve diagnostic screenshots (never credentials).
- A passing result establishes **local certification only**; production database, real broker connectors, remote AI model inference, external payment proof, mobile browser compatibility, recovery drills, and security penetration testing remain out of scope.
- Do not merge Phase C into `main` until parent PRs #3–#6 have been reconciled.

## CI

GitHub Actions workflow: `.github/workflows/phase-c-local-certification.yml`.
Run logs contain the definitive executed pass/fail results. An automated build success alone is insufficient. Do not label the system locally certified until the real API and browser stages are green.

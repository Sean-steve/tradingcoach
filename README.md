# TRADE OS

Discipline-first trading performance OS. Log trades → analyze → coach → grow.

## Stack

- **TanStack Start v1** — SSR + server functions, file-based routing under `src/routes/`
- **Tailwind v4** + **shadcn/ui** — Neon Fintech dark theme in `src/styles.css`
- **TanStack Query** — data cache (canonical `useSuspenseQuery(queryOptions)` shape in `src/lib/queries.ts`)
- **Recharts** — equity, drawdown, heatmap, rolling perf, per-dimension bars
- **Zod** + **react-hook-form** — form validation
- **Lovable Cloud (Supabase)** — DB, Auth (email + Google), Storage (`trade-screenshots`)
- **Lovable AI Gateway** (`google/gemini-3-flash-preview`) — daily/weekly/monthly coach + daily advice

## Route map

| Route | Purpose |
|-------|---------|
| `/auth` | Sign in / sign up (email + Google) |
| `/dashboard` | Command Center: balance, equity, P&L, scores, mission, AI daily advice |
| `/trades` | Trade Journal list |
| `/trades/new` | Log a trade (blocks entry on hard loss lock; reflection gate) |
| `/trades/$tradeId` | Trade detail + screenshots + tagged mistakes |
| `/import` | CSV import (MT4/MT5/generic presets) |
| `/analytics` | Equity, DD, monthly/DoW P&L, heatmap calendar, rolling perf, win-rate trend, D/W/M/Q/Y/Lifetime tables |
| `/strategies` `/sessions` `/assets` | Per-dimension dashboards + AI conclusion |
| `/psychology` | Pre/post check-ins, pattern detection ("you lose X% when stressed") |
| `/discipline` | Rule compliance, mistake catalog, cost-of-mistakes $ |
| `/rules` | Personal rule builder |
| `/goals` | Goal tracker |
| `/habits` | Daily habit tracker |
| `/challenges` | Time-boxed challenges with reward badges |
| `/forecast` | Forward performance projections |
| `/rewards` | Badges catalog + earned badges |
| `/coach` | AI performance coach (daily/weekly/monthly reviews) |
| `/score` | Composite 0–100 performance score with pillar breakdown |
| `/notifications` | In-app alerts |
| `/accounts` | Multi-account switcher + creation |
| `/reports` | Report exports (PDF via jspdf, Excel via xlsx) |
| `/settings` | Profile + prefs |

## Environment variables

Server (never exposed to client):
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY` — Lovable AI Gateway

Client (Vite):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

## Security model

- RLS enabled on every user table, scoped to `auth.uid()`.
- Roles live in `public.user_roles` and are checked via the security-definer `public.has_role(uuid, app_role)`. No roles are stored on `profiles`.
- The service role client (`src/integrations/supabase/client.server.ts`) is loaded lazily inside handlers only.

## Local development

```bash
bun install
bun run dev
```

Vite dev server runs on port 8080. The TanStack router plugin regenerates `src/routeTree.gen.ts` on file changes.
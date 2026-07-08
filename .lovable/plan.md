# TRADE OS — v1 Build Plan (Coach Core)

## Scope
Coach Core slice from your spec — a working Performance Operating System, not a shallow demo of 23 modules.

**In v1**
1. Auth (email + Google) via Lovable Cloud
2. **Command Center** — balance, equity curve, today/week/month P&L, win rate, profit factor, expectancy, avg RR, current & max drawdown, streaks, Discipline Score, Psychology Score, Rule Compliance %, Consistency Index, Weekly/Monthly Grade, Today's Mission, AI Daily Advice
3. **Trade Journal** — full trade form (all fields from spec), screenshot uploads (before/after/annotated), pre/post notes, checklist, confidence, setup quality, emotions, mistakes, rule violations, tags. Trade list with filters + trade detail / replay view
4. **CSV Import** — MT4/MT5/generic CSV mapper
5. **Advanced Analytics** — daily/weekly/monthly/quarterly/yearly/lifetime tables with every metric in spec
6. **Visual Analytics** — equity curve, drawdown curve, win-rate trend, monthly/weekly/daily comparison, heatmap calendar, session/asset/strategy breakdowns, rolling performance
7. **Strategy / Session / Asset Analytics** — per-dimension dashboards with AI conclusion
8. **Psychology Engine** — pre/post trade check-ins, pattern detection ("you lose X% when stressed")
9. **Discipline + Mistake Engines** — auto-categorized mistake tracking, rule compliance scoring, discipline score 0–100, cost-of-mistakes analytics
10. **Performance Score** (0–100 composite) with weighted breakdown
11. **AI Performance Coach** — Daily / Weekly / Monthly reviews (analytical, neutral tone, no market predictions) via Lovable AI Gateway
12. **Risk guardrails** — max daily/weekly loss lock, warnings, reflection gate

**Deferred to v2+** (I'll flag hooks in the schema so we can layer them without migrations)
- Goal Engine, Reward Engine, Habit Tracker, Challenges/Badges
- Forecast Engine, Multi-account, Profit Allocation
- PDF/Excel report exports, Notifications, Broker API sync

## Design direction
**Neon Fintech** — deep navy `#0a0f1e` base, mint `#00e5a8` primary (P&L green + accents), electric blue `#3b82f6` secondary, pink `#f472b6` for warnings/highlights, red for losses. Glowing chart lines, subtle gradients on cards, sharp data-dense tables. Inter for UI, JetBrains Mono for numeric columns. Dark theme only.

## AI coach tone
Analytical & neutral. Format: findings → evidence (stat + trade refs) → recommendation. No hype, no emojis, no market calls.

## Tech
- **TanStack Start** (existing template) — not Next.js, same capability
- **Lovable Cloud** (Postgres + auth + storage) — replaces Prisma/NextAuth/S3
- **Lovable AI Gateway** with `google/gemini-3-flash-preview` for coach reviews — replaces direct OpenAI
- Recharts for charts, Tailwind v4 + shadcn, TanStack Query, Zod, react-hook-form

## Data model (Cloud tables)
`profiles`, `accounts` (multi-account ready), `strategies`, `trades`, `trade_screenshots`, `psychology_checkins`, `mistakes` (catalog), `trade_mistakes` (join), `rules`, `rule_violations`, `daily_snapshots` (cached metrics), `coach_reviews` (AI outputs), `user_roles`. RLS on every table scoped to `auth.uid()`.

## Delivery order (each step is a working screen)
1. Enable Cloud + AI Gateway, migrations, RLS, seed mistake catalog
2. Design system (tokens, chart theme, numeric type)
3. Auth + app shell + navigation
4. Trade Journal (form + list + detail) + screenshot upload
5. CSV importer
6. Metrics engine (server functions computing all analytics)
7. Command Center
8. Advanced + Visual Analytics
9. Strategy / Session / Asset dashboards
10. Psychology + Discipline + Mistake engines
11. Performance Score + Risk guardrails
12. AI Coach reviews (daily/weekly/monthly)

This is a large v1 — expect it to take several build turns. I'll ship in the order above so the app is usable at each step.
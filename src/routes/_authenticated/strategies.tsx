import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { accountsQuery, tradesQuery, strategiesQuery } from "@/lib/queries";
import { DimensionDashboard } from "@/components/dimension-dashboard";
import type { TradeLike } from "@/lib/metrics";
import { useActiveAccountId } from "@/lib/active-account";

export const Route = createFileRoute("/_authenticated/strategies")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <Page />
    </Suspense>
  ),
});

function Page() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { activeId } = useActiveAccountId();
  const account = accounts.find(a=>a.id===activeId) ?? accounts[0];
  const { data: trades } = useSuspenseQuery(tradesQuery(account?.id));
  const { data: strategies } = useSuspenseQuery(strategiesQuery());
  const nameById = new Map(strategies.map((s) => [s.id, s.name]));
  return (
    <DimensionDashboard currency={account?.currency ?? "USD"}
      title="Strategies"
      trades={trades as unknown as TradeLike[]}
      keyOf={(t) => (t.strategy_id ? nameById.get(t.strategy_id) ?? "Unassigned" : "Unassigned")}
    />
  );
}
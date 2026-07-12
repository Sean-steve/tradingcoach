import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { accountsQuery, tradesQuery } from "@/lib/queries";
import { DimensionDashboard } from "@/components/dimension-dashboard";
import type { TradeLike } from "@/lib/metrics";

export const Route = createFileRoute("/_authenticated/sessions")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <Page />
    </Suspense>
  ),
});

function Page() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: trades } = useSuspenseQuery(tradesQuery(accounts[0]?.id));
  return (
    <DimensionDashboard
      title="Sessions"
      trades={trades as unknown as TradeLike[]}
      keyOf={(t) => t.session ?? "off_hours"}
    />
  );
}
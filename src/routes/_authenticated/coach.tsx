import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useState } from "react";
import { coachReviewsQuery } from "@/lib/queries";
import { generateCoachReview } from "@/lib/coach.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/coach")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <CoachPage />
    </Suspense>
  ),
});

function CoachPage() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const { data: reviews } = useSuspenseQuery(coachReviewsQuery());
  const qc = useQueryClient();
  const runFn = useServerFn(generateCoachReview);
  const mutation = useMutation({
    mutationFn: (p: "daily" | "weekly" | "monthly") => runFn({ data: { period: p } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coach_reviews"] });
      toast.success("Review generated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> AI Performance Coach
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Analytical, neutral reviews. Findings, evidence, next action. No market predictions.</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1 rounded-md border border-border p-1">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-xs capitalize ${period === p ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >{p}</button>
            ))}
          </div>
          <Button onClick={() => mutation.mutate(period)} disabled={mutation.isPending} className="gap-2">
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate {period} review
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {reviews.length === 0 && (
          <Card className="glow-card p-10 border-border/40 text-center text-muted-foreground">
            No reviews yet. Generate your first one above.
          </Card>
        )}
        {reviews.map((r) => (
          <Card key={r.id} className="glow-card p-6 border-border/40">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-primary">{r.period} review</div>
                <div className="text-sm text-muted-foreground">{r.period_start} → {r.period_end}</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed">{r.summary}</p>
            {Array.isArray(r.findings) && r.findings.length > 0 && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Findings</div>
                <ul className="space-y-1.5">
                  {(r.findings as string[]).map((f, i) => (
                    <li key={i} className="text-sm flex gap-2"><span className="text-primary">•</span>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(r.recommendations) && r.recommendations.length > 0 && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Recommendations</div>
                <ul className="space-y-1.5">
                  {(r.recommendations as string[]).map((f, i) => (
                    <li key={i} className="text-sm flex gap-2"><span className="text-[color:var(--warn)]">→</span>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
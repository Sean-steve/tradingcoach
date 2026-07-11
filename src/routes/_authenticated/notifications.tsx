import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bell, Check, CheckCheck, AlertTriangle, Info, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <NotificationsPage />
    </Suspense>
  ),
});

function iconFor(sev: string) {
  if (sev === "warning" || sev === "critical") return AlertTriangle;
  if (sev === "success") return Trophy;
  return Info;
}

function NotificationsPage() {
  const qc = useQueryClient();
  const { data: notifs } = useSuspenseQuery(notificationsQuery());
  const unread = notifs.filter((n) => !n.read_at);

  const markAll = async () => {
    const ids = unread.map((n) => n.id);
    if (!ids.length) return;
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Alerts</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1 flex items-center gap-3"><Bell className="h-7 w-7 text-primary" /> Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">{unread.length} unread of {notifs.length} total</p>
        </div>
        {unread.length > 0 && (
          <Button variant="outline" onClick={markAll} className="gap-2"><CheckCheck className="h-4 w-4" /> Mark all read</Button>
        )}
      </div>

      {notifs.length === 0 && (
        <Card className="glow-card border-border/40 p-12 text-center text-muted-foreground">
          You're all caught up. Alerts for rule breaches, streak milestones, and coach nudges will show here.
        </Card>
      )}

      <div className="space-y-2">
        {notifs.map((n) => {
          const Icon = iconFor(n.severity);
          const tone = n.severity === "critical" ? "loss" : n.severity === "warning" ? "warning" : n.severity === "success" ? "profit" : "primary";
          return (
            <Card key={n.id} className={`glow-card border-border/40 p-4 flex items-start gap-3 ${!n.read_at ? "border-primary/30 bg-primary/[0.02]" : ""}`}>
              <Icon className={`h-5 w-5 shrink-0 mt-0.5 text-${tone}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-medium text-sm">{n.title}</div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border/40 rounded px-1.5">{n.kind}</span>
                  {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </div>
                {n.body && <div className="text-sm text-muted-foreground mt-1">{n.body}</div>}
                <div className="text-[11px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              {!n.read_at && (
                <Button size="sm" variant="ghost" onClick={() => markOne(n.id)}><Check className="h-4 w-4" /></Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
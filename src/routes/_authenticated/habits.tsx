import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { habitsQuery, habitLogsQuery } from "@/lib/queries";
import { habitStreak } from "@/lib/forecast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Flame, Repeat, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/habits")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading habits…</div>}>
      <HabitsPage />
    </Suspense>
  ),
});

function HabitsPage() {
  const qc = useQueryClient();
  const { data: habits } = useSuspenseQuery(habitsQuery());
  const { data: logs } = useSuspenseQuery(habitLogsQuery(60));

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const doneToday = new Set(logs.filter((l) => l.log_date === today && l.completed).map((l) => l.habit_id));

  const add = async () => {
    if (!title.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("habits").insert({
      user_id: u.user!.id,
      title: title.trim(),
      description: description.trim() || null,
    });
    if (error) toast.error(error.message);
    else { setTitle(""); setDescription(""); qc.invalidateQueries({ queryKey: ["habits"] }); }
  };

  const toggleToday = async (habitId: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (doneToday.has(habitId)) {
      await supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("log_date", today);
    } else {
      await supabase.from("habit_logs").insert({ user_id: u.user!.id, habit_id: habitId, log_date: today, completed: true });
    }
    qc.invalidateQueries({ queryKey: ["habit_logs"] });
  };

  const del = async (id: string) => {
    await supabase.from("habits").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["habits"] });
  };

  // 30-day grid per habit
  const days: string[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Habits</h1>
        <p className="text-muted-foreground">Small daily rituals compound into professional trading behavior.</p>
      </header>

      <Card className="glow-card p-6 border-border/40 space-y-4">
        <h2 className="font-semibold">New habit</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Review yesterday's trades" className="mt-1" /></div>
          <div><Label>Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" /></div>
        </div>
        <Button onClick={add}>Add habit</Button>
      </Card>

      <section className="space-y-3">
        {habits.length === 0 && (
          <Card className="glow-card p-8 border-border/40 text-center text-muted-foreground">
            <Repeat className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No habits yet. Start with one small ritual.
          </Card>
        )}
        {habits.map((h) => {
          const streak = habitStreak(logs, h.id);
          const doneDates = new Set(logs.filter((l) => l.habit_id === h.id && l.completed).map((l) => l.log_date));
          return (
            <Card key={h.id} className="glow-card p-5 border-border/40">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{h.title}</h3>
                    <span className="inline-flex items-center gap-1 text-xs text-primary"><Flame className="h-3 w-3" /> {streak}d streak</span>
                  </div>
                  {h.description && <p className="text-xs text-muted-foreground mt-0.5">{h.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={doneToday.has(h.id) ? "default" : "outline"}
                    onClick={() => toggleToday(h.id)}
                    className={doneToday.has(h.id) ? "bg-primary/20 text-primary border-primary/40 hover:bg-primary/30" : ""}
                  >
                    <Check className="h-4 w-4 mr-1" /> {doneToday.has(h.id) ? "Done today" : "Mark done"}
                  </Button>
                  <button onClick={() => del(h.id)} className="text-muted-foreground hover:text-loss p-2"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-30 gap-1" style={{ gridTemplateColumns: "repeat(30, minmax(0, 1fr))" }}>
                {days.map((d) => (
                  <div key={d} title={d}
                    className={cn("h-3 rounded-sm border", doneDates.has(d) ? "bg-primary/60 border-primary/60 shadow-[0_0_6px_var(--primary)]" : "bg-muted/20 border-border/30")}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
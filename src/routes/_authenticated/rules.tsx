import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ShieldCheck, Plus, Trash2 } from "lucide-react";

const CATS = ["risk", "entry", "exit", "psychology", "process"] as const;

const allRulesQuery = () =>
  queryOptions({
    queryKey: ["rules_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const Route = createFileRoute("/_authenticated/rules")({
  component: () => (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <RulesPage />
    </Suspense>
  ),
});

function RulesPage() {
  const qc = useQueryClient();
  const { data: rules } = useSuspenseQuery(allRulesQuery());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATS)[number]>("risk");

  const create = async () => {
    if (!title.trim()) return toast.error("Title required");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("rules").insert({
      user_id: u.user!.id, title: title.trim(), description: description.trim() || null, category, is_active: true,
    });
    if (error) return toast.error(error.message);
    setTitle(""); setDescription("");
    toast.success("Rule added");
    qc.invalidateQueries({ queryKey: ["rules_all"] });
    qc.invalidateQueries({ queryKey: ["rules"] });
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("rules").update({ is_active: active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["rules_all"] });
    qc.invalidateQueries({ queryKey: ["rules"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    await supabase.from("rules").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["rules_all"] });
    qc.invalidateQueries({ queryKey: ["rules"] });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Trading Plan</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1 flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-primary" /> Rules</h1>
        <p className="text-sm text-muted-foreground mt-1">Your personal rulebook. Violations get tracked against every trade.</p>
      </div>

      <Card className="glow-card border-border/40 p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> New rule</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Max 1% risk per trade" className="mt-1" />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as (typeof CATS)[number])}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button onClick={create} className="w-full">Add rule</Button></div>
        </div>
        <div>
          <Label>Description (optional)</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When and why this rule matters…" rows={2} className="mt-1" />
        </div>
      </Card>

      <div className="space-y-2">
        {rules.length === 0 && (
          <Card className="glow-card border-border/40 p-8 text-center text-muted-foreground">No rules yet. Add your first above.</Card>
        )}
        {rules.map((r) => (
          <Card key={r.id} className="glow-card border-border/40 p-4 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`font-medium ${r.is_active ? "" : "text-muted-foreground line-through"}`}>{r.title}</div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border/40 rounded px-1.5">{r.category ?? "general"}</span>
              </div>
              {r.description && <div className="text-sm text-muted-foreground mt-1">{r.description}</div>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Switch checked={r.is_active} onCheckedChange={(v) => toggle(r.id, v)} />
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3 text-loss" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
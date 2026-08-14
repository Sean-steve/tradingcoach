import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type TradeRow = Database["public"]["Tables"]["trades"]["Row"];

export const accountsQuery = () =>
  queryOptions({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_archived", false)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

export const tradesQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["trades", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("trades")
        .select("*")
        .order("entered_at", { ascending: false });
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TradeRow[];
    },
  });

export const strategiesQuery = () =>
  queryOptions({
    queryKey: ["strategies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("strategies").select("*").eq("is_archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const mistakeCatalogQuery = () =>
  queryOptions({
    queryKey: ["mistake_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mistake_catalog").select("*").order("severity", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const rulesQuery = () =>
  queryOptions({
    queryKey: ["rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rules").select("*").eq("is_active", true).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

export const coachReviewsQuery = (period?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly") =>
  queryOptions({
    queryKey: ["coach_reviews", period ?? "all"],
    queryFn: async () => {
      let q = supabase.from("coach_reviews").select("*").order("period_start", { ascending: false });
      if (period) q = q.eq("period", period);
      const { data, error } = await q.limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

export const psychQuery = () =>
  queryOptions({
    queryKey: ["psych"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("psychology_checkins")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

export const tradeMistakesQuery = () =>
  queryOptions({
    queryKey: ["trade_mistakes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trade_mistakes").select("*, mistake_catalog(name,category,severity,suggested_fix)");
      if (error) throw error;
      return data ?? [];
    },
  });

export const goalsQuery = () =>
  queryOptions({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("goals").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const habitsQuery = () =>
  queryOptions({
    queryKey: ["habits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("habits").select("*").eq("is_active", true).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

export const habitLogsQuery = (days = 60) =>
  queryOptions({
    queryKey: ["habit_logs", days],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - days);
      const { data, error } = await supabase
        .from("habit_logs")
        .select("*")
        .gte("log_date", from.toISOString().slice(0, 10))
        .order("log_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const badgesCatalogQuery = () =>
  queryOptions({
    queryKey: ["badges_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badges_catalog").select("*").order("tier");
      if (error) throw error;
      return data ?? [];
    },
  });

export const userBadgesQuery = () =>
  queryOptions({
    queryKey: ["user_badges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_badges").select("*").order("earned_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const profitAllocationsQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["profit_allocations", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("profit_allocations").select("*").order("allocated_at", { ascending: false });
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const allocationRulesQuery = () =>
  queryOptions({
    queryKey: ["allocation_rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("allocation_rules").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

export const notificationsQuery = () =>
  queryOptions({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

export const challengesQuery = () =>
  queryOptions({
    queryKey: ["challenges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("challenges").select("*").eq("is_active", true).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

export const challengeProgressQuery = () =>
  queryOptions({
    queryKey: ["challenge_progress"],
    queryFn: async () => {
      const { data, error } = await supabase.from("challenge_progress").select("*").order("started_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
export const tomQuery = () =>
  queryOptions({
    queryKey: ["tom_versions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tom_versions").select("*").order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const behaviorTaxonomyQuery = () =>
  queryOptions({
    queryKey: ["behavior_taxonomy"],
    queryFn: async () => {
      const { data, error } = await supabase.from("behavior_taxonomy").select("*").order("category").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const behaviorEventsQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["behavior_events", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("behavior_events").select("*").order("occurred_at", { ascending: false }).limit(1000);
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const insightsQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["insights", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("insights").select("*").order("impact_estimate", { ascending: true });
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const insightEvidenceQuery = (insightId: string) =>
  queryOptions({
    queryKey: ["insight_evidence", insightId],
    queryFn: async () => {
      const { data, error } = await supabase.from("insight_evidence").select("*").eq("insight_id", insightId);
      if (error) throw error;
      return data ?? [];
    },
  });

export const rootCausesQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["root_causes", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("root_causes").select("*").order("impact_estimate", { ascending: true });
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const recommendationsQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["recommendations", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("recommendations").select("*").order("priority");
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const decisionScoresQuery = () =>
  queryOptions({
    queryKey: ["decision_scores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("decision_scores").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

export const interventionsQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["interventions", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("interventions").select("*").order("created_at", { ascending: false });
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const guardrailChecksQuery = () =>
  queryOptions({
    queryKey: ["guardrail_checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guardrail_checks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const twinScenariosQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["twin_scenarios", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("twin_scenarios").select("*").order("created_at", { ascending: false });
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const behaviorEventsAllQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["behavior_events_all", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("behavior_events").select("trade_id,code,category,severity,occurred_at");
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const memoryEntriesQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["memory_entries", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("memory_entries").select("*").order("occurred_at", { ascending: false }).limit(300);
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const insightLifecycleQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["insight_lifecycle", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("insight_lifecycle").select("*").order("confirmations", { ascending: false });
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const adviceOutcomesQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["advice_outcomes", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("advice_outcomes").select("*").order("weight", { ascending: false });
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const graphNodesQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["graph_nodes", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("graph_nodes").select("*");
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

export const graphEdgesQuery = (accountId?: string) =>
  queryOptions({
    queryKey: ["graph_edges", accountId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("graph_edges").select("*");
      if (accountId) q = q.eq("account_id", accountId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

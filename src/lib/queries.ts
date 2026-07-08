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
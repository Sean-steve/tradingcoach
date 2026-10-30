export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          broker: string | null
          created_at: string
          current_balance: number
          id: string
          is_archived: boolean
          is_default: boolean
          max_daily_loss: number | null
          max_risk_pct: number | null
          max_trades_per_day: number | null
          max_weekly_loss: number | null
          name: string
          starting_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          broker?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          is_archived?: boolean
          is_default?: boolean
          max_daily_loss?: number | null
          max_risk_pct?: number | null
          max_trades_per_day?: number | null
          max_weekly_loss?: number | null
          name: string
          starting_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          broker?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          is_archived?: boolean
          is_default?: boolean
          max_daily_loss?: number | null
          max_risk_pct?: number | null
          max_trades_per_day?: number | null
          max_weekly_loss?: number | null
          name?: string
          starting_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      advice_outcomes: {
        Row: {
          accepted: boolean
          account_id: string | null
          advice_key: string
          advice_type: string
          checks_total: number
          created_at: string
          dismissed: boolean
          id: string
          intervention_id: string | null
          measured_at: string
          respected_rate: number | null
          title: string | null
          updated_at: string
          user_id: string
          weight: number
          worked: boolean | null
        }
        Insert: {
          accepted?: boolean
          account_id?: string | null
          advice_key: string
          advice_type: string
          checks_total?: number
          created_at?: string
          dismissed?: boolean
          id?: string
          intervention_id?: string | null
          measured_at?: string
          respected_rate?: number | null
          title?: string | null
          updated_at?: string
          user_id: string
          weight?: number
          worked?: boolean | null
        }
        Update: {
          accepted?: boolean
          account_id?: string | null
          advice_key?: string
          advice_type?: string
          checks_total?: number
          created_at?: string
          dismissed?: boolean
          id?: string
          intervention_id?: string | null
          measured_at?: string
          respected_rate?: number | null
          title?: string | null
          updated_at?: string
          user_id?: string
          weight?: number
          worked?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "advice_outcomes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advice_outcomes_intervention_id_fkey"
            columns: ["intervention_id"]
            isOneToOne: false
            referencedRelation: "interventions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_request_log: {
        Row: {
          account_id: string | null
          allowed: boolean
          created_at: string
          duration_ms: number | null
          fn: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          allowed?: boolean
          created_at?: string
          duration_ms?: number | null
          fn: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          allowed?: boolean
          created_at?: string
          duration_ms?: number | null
          fn?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_request_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_rules: {
        Row: {
          account_id: string
          created_at: string
          id: string
          reinvest_pct: number
          reserve_pct: number
          tax_pct: number
          updated_at: string
          user_id: string
          withdraw_pct: number
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          reinvest_pct?: number
          reserve_pct?: number
          tax_pct?: number
          updated_at?: string
          user_id: string
          withdraw_pct?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          reinvest_pct?: number
          reserve_pct?: number
          tax_pct?: number
          updated_at?: string
          user_id?: string
          withdraw_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocation_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      badges_catalog: {
        Row: {
          category: Database["public"]["Enums"]["badge_category"]
          code: string
          created_at: string
          criteria: Json
          description: string
          icon: string | null
          id: string
          name: string
          tier: Database["public"]["Enums"]["badge_tier"]
        }
        Insert: {
          category: Database["public"]["Enums"]["badge_category"]
          code: string
          created_at?: string
          criteria: Json
          description: string
          icon?: string | null
          id?: string
          name: string
          tier?: Database["public"]["Enums"]["badge_tier"]
        }
        Update: {
          category?: Database["public"]["Enums"]["badge_category"]
          code?: string
          created_at?: string
          criteria?: Json
          description?: string
          icon?: string | null
          id?: string
          name?: string
          tier?: Database["public"]["Enums"]["badge_tier"]
        }
        Relationships: []
      }
      behavior_events: {
        Row: {
          account_id: string | null
          category: Database["public"]["Enums"]["behavior_category"]
          code: string
          context: Json
          created_at: string
          detector: string | null
          id: string
          occurred_at: string
          severity: number
          source: Database["public"]["Enums"]["behavior_source"]
          trade_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          category: Database["public"]["Enums"]["behavior_category"]
          code: string
          context?: Json
          created_at?: string
          detector?: string | null
          id?: string
          occurred_at?: string
          severity?: number
          source?: Database["public"]["Enums"]["behavior_source"]
          trade_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["behavior_category"]
          code?: string
          context?: Json
          created_at?: string
          detector?: string | null
          id?: string
          occurred_at?: string
          severity?: number
          source?: Database["public"]["Enums"]["behavior_source"]
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_events_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "behavior_taxonomy"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "behavior_events_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      behavior_taxonomy: {
        Row: {
          category: Database["public"]["Enums"]["behavior_category"]
          code: string
          created_at: string
          default_severity: number
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category: Database["public"]["Enums"]["behavior_category"]
          code: string
          created_at?: string
          default_severity?: number
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: Database["public"]["Enums"]["behavior_category"]
          code?: string
          created_at?: string
          default_severity?: number
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string
          current_value: number
          ends_at: string
          failed_at: string | null
          id: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string
          current_value?: number
          ends_at: string
          failed_at?: string | null
          id?: string
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string
          current_value?: number
          ends_at?: string
          failed_at?: string | null
          id?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number
          id: string
          is_active: boolean
          metric: string
          reward_badge_slug: string | null
          slug: string
          target_value: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days: number
          id?: string
          is_active?: boolean
          metric: string
          reward_badge_slug?: string | null
          slug: string
          target_value: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          metric?: string
          reward_badge_slug?: string | null
          slug?: string
          target_value?: number
          title?: string
        }
        Relationships: []
      }
      coach_reviews: {
        Row: {
          account_id: string | null
          created_at: string
          findings: Json
          id: string
          metrics: Json
          model: string | null
          period: Database["public"]["Enums"]["review_period"]
          period_end: string
          period_start: string
          recommendations: Json
          summary: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          findings?: Json
          id?: string
          metrics?: Json
          model?: string | null
          period: Database["public"]["Enums"]["review_period"]
          period_end: string
          period_start: string
          recommendations?: Json
          summary: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          findings?: Json
          id?: string
          metrics?: Json
          model?: string | null
          period?: Database["public"]["Enums"]["review_period"]
          period_end?: string
          period_start?: string
          recommendations?: Json
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_reviews_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_snapshots: {
        Row: {
          account_id: string
          created_at: string
          day: string
          ending_balance: number
          id: string
          losses: number
          pnl: number
          starting_balance: number
          trades_count: number
          user_id: string
          wins: number
        }
        Insert: {
          account_id: string
          created_at?: string
          day: string
          ending_balance: number
          id?: string
          losses?: number
          pnl?: number
          starting_balance: number
          trades_count?: number
          user_id: string
          wins?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          day?: string
          ending_balance?: number
          id?: string
          losses?: number
          pnl?: number
          starting_balance?: number
          trades_count?: number
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_scores: {
        Row: {
          created_at: string
          entry_quality: number
          exit_quality: number
          id: string
          notes: string | null
          patience: number
          plan_adherence: number
          process_score: number
          risk_control: number
          source: Database["public"]["Enums"]["behavior_source"]
          trade_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_quality?: number
          exit_quality?: number
          id?: string
          notes?: string | null
          patience?: number
          plan_adherence?: number
          process_score?: number
          risk_control?: number
          source?: Database["public"]["Enums"]["behavior_source"]
          trade_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_quality?: number
          exit_quality?: number
          id?: string
          notes?: string | null
          patience?: number
          plan_adherence?: number
          process_score?: number
          risk_control?: number
          source?: Database["public"]["Enums"]["behavior_source"]
          trade_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_scores_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: true
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          account_id: string | null
          achieved_at: string | null
          created_at: string
          deadline: string | null
          description: string | null
          id: string
          metric: Database["public"]["Enums"]["goal_metric"]
          starting_value: number | null
          status: Database["public"]["Enums"]["goal_status"]
          target_value: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          achieved_at?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          metric: Database["public"]["Enums"]["goal_metric"]
          starting_value?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_value: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          achieved_at?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          id?: string
          metric?: Database["public"]["Enums"]["goal_metric"]
          starting_value?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_value?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_edges: {
        Row: {
          account_id: string | null
          confidence: number
          created_at: string
          detail: Json
          edge_key: string
          id: string
          impact_estimate: number | null
          relation: string
          sample_size: number
          source_key: string
          target_key: string
          user_id: string
          weight: number
        }
        Insert: {
          account_id?: string | null
          confidence?: number
          created_at?: string
          detail?: Json
          edge_key: string
          id?: string
          impact_estimate?: number | null
          relation: string
          sample_size?: number
          source_key: string
          target_key: string
          user_id: string
          weight?: number
        }
        Update: {
          account_id?: string | null
          confidence?: number
          created_at?: string
          detail?: Json
          edge_key?: string
          id?: string
          impact_estimate?: number | null
          relation?: string
          sample_size?: number
          source_key?: string
          target_key?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "graph_edges_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_nodes: {
        Row: {
          account_id: string | null
          created_at: string
          detail: Json
          id: string
          impact_estimate: number | null
          label: string
          node_key: string
          node_type: string
          occurrences: number
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          impact_estimate?: number | null
          label: string
          node_key: string
          node_type: string
          occurrences?: number
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          impact_estimate?: number | null
          label?: string
          node_key?: string
          node_type?: string
          occurrences?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "graph_nodes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      guardrail_checks: {
        Row: {
          context: Json
          created_at: string
          id: string
          intervention_id: string
          note: string | null
          outcome: Database["public"]["Enums"]["guardrail_outcome"]
          trade_id: string | null
          triggered: boolean
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          intervention_id: string
          note?: string | null
          outcome?: Database["public"]["Enums"]["guardrail_outcome"]
          trade_id?: string | null
          triggered?: boolean
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          intervention_id?: string
          note?: string | null
          outcome?: Database["public"]["Enums"]["guardrail_outcome"]
          trade_id?: string | null
          triggered?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardrail_checks_intervention_id_fkey"
            columns: ["intervention_id"]
            isOneToOne: false
            referencedRelation: "interventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardrail_checks_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          completed: boolean
          created_at: string
          habit_id: string
          id: string
          log_date: string
          note: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          habit_id: string
          id?: string
          log_date?: string
          note?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          habit_id?: string
          id?: string
          log_date?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          cadence: Database["public"]["Enums"]["habit_cadence"]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          target_per_period: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cadence?: Database["public"]["Enums"]["habit_cadence"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          target_per_period?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cadence?: Database["public"]["Enums"]["habit_cadence"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          target_per_period?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      insight_evidence: {
        Row: {
          created_at: string
          detail: Json
          id: string
          insight_id: string
          label: string
          trade_id: string | null
          user_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          insight_id: string
          label: string
          trade_id?: string | null
          user_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          insight_id?: string
          label?: string
          trade_id?: string | null
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insight_evidence_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_evidence_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_lifecycle: {
        Row: {
          account_id: string | null
          archived_reason: string | null
          category: string | null
          claim: string
          confirmations: number
          contradictions: number
          created_at: string
          first_seen_at: string
          id: string
          insight_key: string
          last_confirmed_at: string | null
          last_observed_value: number | null
          last_seen_at: string
          status: Database["public"]["Enums"]["lifecycle_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          archived_reason?: string | null
          category?: string | null
          claim: string
          confirmations?: number
          contradictions?: number
          created_at?: string
          first_seen_at?: string
          id?: string
          insight_key: string
          last_confirmed_at?: string | null
          last_observed_value?: number | null
          last_seen_at?: string
          status?: Database["public"]["Enums"]["lifecycle_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          archived_reason?: string | null
          category?: string | null
          claim?: string
          confirmations?: number
          contradictions?: number
          created_at?: string
          first_seen_at?: string
          id?: string
          insight_key?: string
          last_confirmed_at?: string | null
          last_observed_value?: number | null
          last_seen_at?: string
          status?: Database["public"]["Enums"]["lifecycle_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_lifecycle_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          account_id: string | null
          baseline_value: number | null
          category: string
          ci_high: number | null
          ci_low: number | null
          claim: string
          confidence: number
          created_at: string
          delta: number | null
          detail: Json
          generated_at: string
          id: string
          impact_estimate: number | null
          insight_key: string
          metric: string
          min_sample: number
          observed_value: number | null
          p_value: number | null
          q_value: number | null
          sample_size: number
          status: Database["public"]["Enums"]["insight_status"]
          tests_in_run: number
          updated_at: string
          user_id: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          account_id?: string | null
          baseline_value?: number | null
          category: string
          ci_high?: number | null
          ci_low?: number | null
          claim: string
          confidence?: number
          created_at?: string
          delta?: number | null
          detail?: Json
          generated_at?: string
          id?: string
          impact_estimate?: number | null
          insight_key: string
          metric: string
          min_sample?: number
          observed_value?: number | null
          p_value?: number | null
          q_value?: number | null
          sample_size?: number
          status?: Database["public"]["Enums"]["insight_status"]
          tests_in_run?: number
          updated_at?: string
          user_id: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          account_id?: string | null
          baseline_value?: number | null
          category?: string
          ci_high?: number | null
          ci_low?: number | null
          claim?: string
          confidence?: number
          created_at?: string
          delta?: number | null
          detail?: Json
          generated_at?: string
          id?: string
          impact_estimate?: number | null
          insight_key?: string
          metric?: string
          min_sample?: number
          observed_value?: number | null
          p_value?: number | null
          q_value?: number | null
          sample_size?: number
          status?: Database["public"]["Enums"]["insight_status"]
          tests_in_run?: number
          updated_at?: string
          user_id?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      interventions: {
        Row: {
          account_id: string | null
          action: string
          baseline_rate: number | null
          confidence: number
          created_at: string
          evidence: string | null
          habit_id: string | null
          hard_block: boolean
          id: string
          insight_id: string | null
          observed_rate: number | null
          recommendation_id: string | null
          resolved_at: string | null
          review_at: string
          sample_size: number
          starts_at: string
          status: Database["public"]["Enums"]["intervention_status"]
          target_behavior_code: string | null
          target_rate: number | null
          title: string
          trend: Database["public"]["Enums"]["intervention_trend"]
          trigger_config: Json
          trigger_type: Database["public"]["Enums"]["intervention_trigger"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          action: string
          baseline_rate?: number | null
          confidence?: number
          created_at?: string
          evidence?: string | null
          habit_id?: string | null
          hard_block?: boolean
          id?: string
          insight_id?: string | null
          observed_rate?: number | null
          recommendation_id?: string | null
          resolved_at?: string | null
          review_at?: string
          sample_size?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["intervention_status"]
          target_behavior_code?: string | null
          target_rate?: number | null
          title: string
          trend?: Database["public"]["Enums"]["intervention_trend"]
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["intervention_trigger"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          action?: string
          baseline_rate?: number | null
          confidence?: number
          created_at?: string
          evidence?: string | null
          habit_id?: string | null
          hard_block?: boolean
          id?: string
          insight_id?: string | null
          observed_rate?: number | null
          recommendation_id?: string | null
          resolved_at?: string | null
          review_at?: string
          sample_size?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["intervention_status"]
          target_behavior_code?: string | null
          target_rate?: number | null
          title?: string
          trend?: Database["public"]["Enums"]["intervention_trend"]
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["intervention_trigger"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventions_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_entries: {
        Row: {
          account_id: string | null
          body: string | null
          created_at: string
          entry_key: string | null
          id: string
          kind: Database["public"]["Enums"]["memory_kind"]
          occurred_at: string
          refs: Json
          title: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          body?: string | null
          created_at?: string
          entry_key?: string | null
          id?: string
          kind: Database["public"]["Enums"]["memory_kind"]
          occurred_at?: string
          refs?: Json
          title: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          body?: string | null
          created_at?: string
          entry_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["memory_kind"]
          occurred_at?: string
          refs?: Json
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mistake_catalog: {
        Row: {
          category: string
          code: string
          id: string
          name: string
          severity: number
          suggested_fix: string | null
        }
        Insert: {
          category: string
          code: string
          id?: string
          name: string
          severity?: number
          suggested_fix?: string | null
        }
        Update: {
          category?: string
          code?: string
          id?: string
          name?: string
          severity?: number
          suggested_fix?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          base_currency: string | null
          created_at: string
          display_name: string | null
          id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          base_currency?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profit_allocations: {
        Row: {
          account_id: string
          allocated_at: string
          amount: number
          bucket: Database["public"]["Enums"]["allocation_bucket"]
          created_at: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          allocated_at?: string
          amount: number
          bucket: Database["public"]["Enums"]["allocation_bucket"]
          created_at?: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          allocated_at?: string
          amount?: number
          bucket?: Database["public"]["Enums"]["allocation_bucket"]
          created_at?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_allocations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      psychology_checkins: {
        Row: {
          confidence: number | null
          created_at: string
          decision_quality: number | null
          discipline: number | null
          energy: number | null
          fear: number | null
          focus: number | null
          frustration: number | null
          greed: number | null
          id: string
          mental_fatigue: number | null
          mood: number | null
          motivation: number | null
          notes: string | null
          patience: number | null
          phase: string
          satisfaction: number | null
          sleep_quality: number | null
          stress: number | null
          trade_id: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          decision_quality?: number | null
          discipline?: number | null
          energy?: number | null
          fear?: number | null
          focus?: number | null
          frustration?: number | null
          greed?: number | null
          id?: string
          mental_fatigue?: number | null
          mood?: number | null
          motivation?: number | null
          notes?: string | null
          patience?: number | null
          phase: string
          satisfaction?: number | null
          sleep_quality?: number | null
          stress?: number | null
          trade_id?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          decision_quality?: number | null
          discipline?: number | null
          energy?: number | null
          fear?: number | null
          focus?: number | null
          frustration?: number | null
          greed?: number | null
          id?: string
          mental_fatigue?: number | null
          mood?: number | null
          motivation?: number | null
          notes?: string | null
          patience?: number | null
          phase?: string
          satisfaction?: number | null
          sleep_quality?: number | null
          stress?: number | null
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "psychology_checkins_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          is_current: boolean
          account_id: string | null
          action: string
          confidence: number
          created_at: string
          id: string
          impact_estimate: number | null
          insight_id: string | null
          priority: number
          rationale: string | null
          recommendation_key: string
          resolved_at: string | null
          root_cause_id: string | null
          status: Database["public"]["Enums"]["recommendation_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          is_current?: boolean
          account_id?: string | null
          action: string
          confidence?: number
          created_at?: string
          id?: string
          impact_estimate?: number | null
          insight_id?: string | null
          priority?: number
          rationale?: string | null
          recommendation_key: string
          resolved_at?: string | null
          root_cause_id?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          is_current?: boolean
          account_id?: string | null
          action?: string
          confidence?: number
          created_at?: string
          id?: string
          impact_estimate?: number | null
          insight_id?: string | null
          priority?: number
          rationale?: string | null
          recommendation_key?: string
          resolved_at?: string | null
          root_cause_id?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_root_cause_id_fkey"
            columns: ["root_cause_id"]
            isOneToOne: false
            referencedRelation: "root_causes"
            referencedColumns: ["id"]
          },
        ]
      }
      root_causes: {
        Row: {
          is_current: boolean
          account_id: string | null
          cause_key: string
          chain: Json
          confidence: number
          created_at: string
          explanation: string | null
          id: string
          impact_estimate: number | null
          insight_ids: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          is_current?: boolean
          account_id?: string | null
          cause_key: string
          chain?: Json
          confidence?: number
          created_at?: string
          explanation?: string | null
          id?: string
          impact_estimate?: number | null
          insight_ids?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          is_current?: boolean
          account_id?: string | null
          cause_key?: string
          chain?: Json
          confidence?: number
          created_at?: string
          explanation?: string | null
          id?: string
          impact_estimate?: number | null
          insight_ids?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "root_causes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_violations: {
        Row: {
          created_at: string
          id: string
          note: string | null
          rule_id: string
          trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          rule_id: string
          trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          rule_id?: string
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_violations_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_violations_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      strategies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_archived: boolean
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      tom_versions: {
        Row: {
          change_reason: string | null
          created_at: string
          id: string
          identity: string | null
          is_active: boolean
          markets: string[]
          non_negotiables: string[]
          notes: string | null
          risk_limits: Json
          routines: Json
          sessions: string[]
          strategies: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          change_reason?: string | null
          created_at?: string
          id?: string
          identity?: string | null
          is_active?: boolean
          markets?: string[]
          non_negotiables?: string[]
          notes?: string | null
          risk_limits?: Json
          routines?: Json
          sessions?: string[]
          strategies?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          change_reason?: string | null
          created_at?: string
          id?: string
          identity?: string | null
          is_active?: boolean
          markets?: string[]
          non_negotiables?: string[]
          notes?: string | null
          risk_limits?: Json
          routines?: Json
          sessions?: string[]
          strategies?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      trade_mistakes: {
        Row: {
          created_at: string
          id: string
          mistake_code: string
          note: string | null
          trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mistake_code: string
          note?: string | null
          trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mistake_code?: string
          note?: string | null
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_mistakes_mistake_code_fkey"
            columns: ["mistake_code"]
            isOneToOne: false
            referencedRelation: "mistake_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "trade_mistakes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_screenshots: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          kind: string
          storage_path: string
          trade_id: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: string
          storage_path: string
          trade_id: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          kind?: string
          storage_path?: string
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_screenshots_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          account_id: string
          asset: string
          checklist_completed: boolean | null
          confidence: number | null
          created_at: string
          direction: Database["public"]["Enums"]["trade_direction"]
          duration_seconds: number | null
          entered_at: string
          entry_price: number | null
          exit_price: number | null
          exited_at: string | null
          fees: number | null
          followed_plan: boolean | null
          id: string
          lessons: string | null
          market: string | null
          planned_rr: number | null
          pnl: number
          position_size: number | null
          post_notes: string | null
          pre_notes: string | null
          realized_rr: number | null
          reason_entry: string | null
          reason_exit: string | null
          result: Database["public"]["Enums"]["trade_result"]
          risk_pct: number | null
          session: Database["public"]["Enums"]["trade_session"] | null
          setup: string | null
          setup_quality: number | null
          stake: number | null
          stop_loss: number | null
          strategy_id: string | null
          tags: string[] | null
          take_profit: number | null
          tom_version_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          asset: string
          checklist_completed?: boolean | null
          confidence?: number | null
          created_at?: string
          direction: Database["public"]["Enums"]["trade_direction"]
          duration_seconds?: number | null
          entered_at: string
          entry_price?: number | null
          exit_price?: number | null
          exited_at?: string | null
          fees?: number | null
          followed_plan?: boolean | null
          id?: string
          lessons?: string | null
          market?: string | null
          planned_rr?: number | null
          pnl?: number
          position_size?: number | null
          post_notes?: string | null
          pre_notes?: string | null
          realized_rr?: number | null
          reason_entry?: string | null
          reason_exit?: string | null
          result?: Database["public"]["Enums"]["trade_result"]
          risk_pct?: number | null
          session?: Database["public"]["Enums"]["trade_session"] | null
          setup?: string | null
          setup_quality?: number | null
          stake?: number | null
          stop_loss?: number | null
          strategy_id?: string | null
          tags?: string[] | null
          take_profit?: number | null
          tom_version_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          asset?: string
          checklist_completed?: boolean | null
          confidence?: number | null
          created_at?: string
          direction?: Database["public"]["Enums"]["trade_direction"]
          duration_seconds?: number | null
          entered_at?: string
          entry_price?: number | null
          exit_price?: number | null
          exited_at?: string | null
          fees?: number | null
          followed_plan?: boolean | null
          id?: string
          lessons?: string | null
          market?: string | null
          planned_rr?: number | null
          pnl?: number
          position_size?: number | null
          post_notes?: string | null
          pre_notes?: string | null
          realized_rr?: number | null
          reason_entry?: string | null
          reason_exit?: string | null
          result?: Database["public"]["Enums"]["trade_result"]
          risk_pct?: number | null
          session?: Database["public"]["Enums"]["trade_session"] | null
          setup?: string | null
          setup_quality?: number | null
          stake?: number | null
          stop_loss?: number | null
          strategy_id?: string | null
          tags?: string[] | null
          take_profit?: number | null
          tom_version_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_tom_version_id_fkey"
            columns: ["tom_version_id"]
            isOneToOne: false
            referencedRelation: "tom_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      twin_scenarios: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          name: string
          result: Json
          rules: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          name: string
          result?: Json
          rules?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          name?: string
          result?: Json
          rules?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "twin_scenarios_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_ai_quota: {
        Args: { p_function: string }
        Returns: boolean
      }
      claim_intelligence_jobs: {
        Args: { p_limit?: number }
        Returns: Array<{
          account_id: string
          user_id: string
          revision: number
          claimed_revision: number | null
          attempts: number
        }>
      }
      finish_intelligence_job: {
        Args: { p_account: string; p_revision: number; p_success: boolean; p_error?: string | null }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type:
        | "demo"
        | "personal"
        | "funded"
        | "prop_firm"
        | "crypto"
        | "forex"
        | "binary"
      allocation_bucket: "withdraw" | "reinvest" | "tax" | "reserve"
      app_role: "user" | "admin"
      badge_category:
        | "discipline"
        | "consistency"
        | "psychology"
        | "milestone"
        | "risk"
      badge_tier: "bronze" | "silver" | "gold" | "platinum"
      behavior_category:
        | "emotional"
        | "decision"
        | "discipline"
        | "risk"
        | "cognitive_bias"
      behavior_source: "derived" | "manual"
      goal_metric:
        | "pnl"
        | "win_rate"
        | "profit_factor"
        | "discipline_score"
        | "consistency"
        | "trade_count"
        | "max_drawdown_pct"
        | "performance_score"
      goal_status: "active" | "achieved" | "failed" | "archived"
      guardrail_outcome: "respected" | "overridden" | "not_triggered"
      habit_cadence: "daily" | "weekly"
      insight_status: "validated" | "insufficient_evidence" | "invalidated"
      intervention_status: "active" | "succeeded" | "failed" | "archived"
      intervention_trend:
        | "improving"
        | "flat"
        | "regressing"
        | "insufficient_evidence"
      intervention_trigger:
        | "loss_streak"
        | "stress_level"
        | "risk_above"
        | "trades_today"
        | "session"
        | "behavior_code"
        | "always"
      lifecycle_status: "emerging" | "durable" | "archived"
      memory_kind:
        | "discovery"
        | "change"
        | "regression"
        | "milestone"
        | "manual_change"
        | "intervention"
      recommendation_status: "active" | "accepted" | "dismissed" | "completed"
      review_period: "daily" | "weekly" | "monthly" | "quarterly" | "yearly"
      trade_direction: "long" | "short"
      trade_result: "win" | "loss" | "breakeven" | "open"
      trade_session:
        | "asian"
        | "london"
        | "newyork"
        | "overlap_ln"
        | "overlap_ny"
        | "off_hours"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: [
        "demo",
        "personal",
        "funded",
        "prop_firm",
        "crypto",
        "forex",
        "binary",
      ],
      allocation_bucket: ["withdraw", "reinvest", "tax", "reserve"],
      app_role: ["user", "admin"],
      badge_category: [
        "discipline",
        "consistency",
        "psychology",
        "milestone",
        "risk",
      ],
      badge_tier: ["bronze", "silver", "gold", "platinum"],
      behavior_category: [
        "emotional",
        "decision",
        "discipline",
        "risk",
        "cognitive_bias",
      ],
      behavior_source: ["derived", "manual"],
      goal_metric: [
        "pnl",
        "win_rate",
        "profit_factor",
        "discipline_score",
        "consistency",
        "trade_count",
        "max_drawdown_pct",
        "performance_score",
      ],
      goal_status: ["active", "achieved", "failed", "archived"],
      guardrail_outcome: ["respected", "overridden", "not_triggered"],
      habit_cadence: ["daily", "weekly"],
      insight_status: ["validated", "insufficient_evidence", "invalidated"],
      intervention_status: ["active", "succeeded", "failed", "archived"],
      intervention_trend: [
        "improving",
        "flat",
        "regressing",
        "insufficient_evidence",
      ],
      intervention_trigger: [
        "loss_streak",
        "stress_level",
        "risk_above",
        "trades_today",
        "session",
        "behavior_code",
        "always",
      ],
      lifecycle_status: ["emerging", "durable", "archived"],
      memory_kind: [
        "discovery",
        "change",
        "regression",
        "milestone",
        "manual_change",
        "intervention",
      ],
      recommendation_status: ["active", "accepted", "dismissed", "completed"],
      review_period: ["daily", "weekly", "monthly", "quarterly", "yearly"],
      trade_direction: ["long", "short"],
      trade_result: ["win", "loss", "breakeven", "open"],
      trade_session: [
        "asian",
        "london",
        "newyork",
        "overlap_ln",
        "overlap_ny",
        "off_hours",
      ],
    },
  },
} as const

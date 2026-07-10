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
      habit_cadence: "daily" | "weekly"
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
      habit_cadence: ["daily", "weekly"],
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

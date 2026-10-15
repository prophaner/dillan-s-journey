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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          owner_id: string
          target_id: string
          target_table: string
          target_version: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          owner_id: string
          target_id: string
          target_table: string
          target_version: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          owner_id?: string
          target_id?: string
          target_table?: string
          target_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_access_grants: {
        Row: {
          accepted_at: string | null
          coach_id: string | null
          created_at: string
          id: string
          invite_email: string
          owner_id: string
          revoked_at: string | null
          scopes: Database["public"]["Enums"]["grant_scope"][]
          status: Database["public"]["Enums"]["grant_status"]
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          coach_id?: string | null
          created_at?: string
          id?: string
          invite_email: string
          owner_id: string
          revoked_at?: string | null
          scopes?: Database["public"]["Enums"]["grant_scope"][]
          status?: Database["public"]["Enums"]["grant_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          coach_id?: string | null
          created_at?: string
          id?: string
          invite_email?: string
          owner_id?: string
          revoked_at?: string | null
          scopes?: Database["public"]["Enums"]["grant_scope"][]
          status?: Database["public"]["Enums"]["grant_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "coach_access_grants_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_access_grants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_items: {
        Row: {
          archived_at: string | null
          attachments: Json
          available: boolean
          capacity: number | null
          capacity_unit: string | null
          created_at: string
          detail: string | null
          id: string
          idempotency_key: string | null
          increments: number[]
          is_demo: boolean
          label: string | null
          owner_id: string
          quantity: number
          source: Database["public"]["Enums"]["record_source"]
          type: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          attachments?: Json
          available?: boolean
          capacity?: number | null
          capacity_unit?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          idempotency_key?: string | null
          increments?: number[]
          is_demo?: boolean
          label?: string | null
          owner_id: string
          quantity?: number
          source?: Database["public"]["Enums"]["record_source"]
          type: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          attachments?: Json
          available?: boolean
          capacity?: number | null
          capacity_unit?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          idempotency_key?: string | null
          increments?: number[]
          is_demo?: boolean
          label?: string | null
          owner_id?: string
          quantity?: number
          source?: Database["public"]["Enums"]["record_source"]
          type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipment_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          archived_at: string | null
          content_source: string | null
          created_at: string
          cues: string[]
          equipment: string[]
          id: string
          is_demo: boolean
          movement: string | null
          muscles: string[]
          name: string
          owner_id: string | null
          review_status: string
          source: Database["public"]["Enums"]["record_source"]
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          content_source?: string | null
          created_at?: string
          cues?: string[]
          equipment?: string[]
          id?: string
          is_demo?: boolean
          movement?: string | null
          muscles?: string[]
          name: string
          owner_id?: string | null
          review_status?: string
          source?: Database["public"]["Enums"]["record_source"]
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          content_source?: string | null
          created_at?: string
          cues?: string[]
          equipment?: string[]
          id?: string
          is_demo?: boolean
          movement?: string | null
          muscles?: string[]
          name?: string
          owner_id?: string | null
          review_status?: string
          source?: Database["public"]["Enums"]["record_source"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "exercises_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_links: {
        Row: {
          block_id: string | null
          created_at: string
          exercise_id: string | null
          goal_id: string
          id: string
          owner_id: string
          relationship_note: string | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          exercise_id?: string | null
          goal_id: string
          id?: string
          owner_id: string
          relationship_note?: string | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          exercise_id?: string | null
          goal_id?: string
          id?: string
          owner_id?: string
          relationship_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_links_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "routine_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_links_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_links_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          archived_at: string | null
          baseline_ref: string | null
          created_at: string
          deadline: string | null
          id: string
          idempotency_key: string | null
          is_demo: boolean
          metric: string | null
          owner_id: string
          parent_id: string | null
          priority: number
          source: Database["public"]["Enums"]["record_source"]
          status: string
          target: number | null
          target_unit: string | null
          title: string
          updated_at: string
          user_words: string | null
          version: number
        }
        Insert: {
          archived_at?: string | null
          baseline_ref?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          metric?: string | null
          owner_id: string
          parent_id?: string | null
          priority?: number
          source?: Database["public"]["Enums"]["record_source"]
          status?: string
          target?: number | null
          target_unit?: string | null
          title: string
          updated_at?: string
          user_words?: string | null
          version?: number
        }
        Update: {
          archived_at?: string | null
          baseline_ref?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          metric?: string | null
          owner_id?: string
          parent_id?: string | null
          priority?: number
          source?: Database["public"]["Enums"]["record_source"]
          status?: string
          target?: number | null
          target_unit?: string | null
          title?: string
          updated_at?: string
          user_words?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      limitation_links: {
        Row: {
          block_id: string | null
          created_at: string
          exercise_id: string | null
          id: string
          limitation_id: string
          owner_id: string
          relationship_note: string | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          exercise_id?: string | null
          id?: string
          limitation_id: string
          owner_id: string
          relationship_note?: string | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          exercise_id?: string | null
          id?: string
          limitation_id?: string
          owner_id?: string
          relationship_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "limitation_links_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "routine_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "limitation_links_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "limitation_links_limitation_id_fkey"
            columns: ["limitation_id"]
            isOneToOne: false
            referencedRelation: "limitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "limitation_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      limitations: {
        Row: {
          archived_at: string | null
          category: string
          coach_shareable: boolean
          context: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          location: string | null
          origin: string | null
          owner_id: string
          review_date: string | null
          side: string | null
          source: Database["public"]["Enums"]["record_source"]
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          category: string
          coach_shareable?: boolean
          context?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          location?: string | null
          origin?: string | null
          owner_id: string
          review_date?: string | null
          side?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          category?: string
          coach_shareable?: boolean
          context?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          location?: string | null
          origin?: string | null
          owner_id?: string
          review_date?: string | null
          side?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "limitations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      measurements: {
        Row: {
          archived_at: string | null
          created_at: string
          entered_value: string | null
          id: string
          method: string | null
          observed_at: string
          owner_id: string
          provenance: Json
          side: string | null
          site: string | null
          source: Database["public"]["Enums"]["record_source"]
          type: string
          unit: string
          updated_at: string
          value: number
          version: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          entered_value?: string | null
          id?: string
          method?: string | null
          observed_at: string
          owner_id: string
          provenance?: Json
          side?: string | null
          site?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          type: string
          unit: string
          updated_at?: string
          value: number
          version?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          entered_value?: string | null
          id?: string
          method?: string | null
          observed_at?: string
          owner_id?: string
          provenance?: Json
          side?: string | null
          site?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          type?: string
          unit?: string
          updated_at?: string
          value?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "measurements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          days_per_week: number | null
          display_name: string | null
          id: string
          length_unit: string
          limitations_answer: string | null
          onboarding_status: string
          onboarding_step: number
          preferences: Json
          session_minutes: number | null
          timezone: string
          updated_at: string
          version: number
          weight_unit: string
        }
        Insert: {
          created_at?: string
          days_per_week?: number | null
          display_name?: string | null
          id: string
          length_unit?: string
          limitations_answer?: string | null
          onboarding_status?: string
          onboarding_step?: number
          preferences?: Json
          session_minutes?: number | null
          timezone?: string
          updated_at?: string
          version?: number
          weight_unit?: string
        }
        Update: {
          created_at?: string
          days_per_week?: number | null
          display_name?: string | null
          id?: string
          length_unit?: string
          limitations_answer?: string | null
          onboarding_status?: string
          onboarding_step?: number
          preferences?: Json
          session_minutes?: number | null
          timezone?: string
          updated_at?: string
          version?: number
          weight_unit?: string
        }
        Relationships: []
      }
      routine_blocks: {
        Row: {
          block_type: string
          created_at: string
          id: string
          is_demo: boolean
          owner_id: string
          position: number
          prescriptions: Json
          priority: string
          rest_seconds: number | null
          rounds: number
          template_version_id: string
          updated_at: string
          version: number
        }
        Insert: {
          block_type: string
          created_at?: string
          id?: string
          is_demo?: boolean
          owner_id: string
          position: number
          prescriptions?: Json
          priority?: string
          rest_seconds?: number | null
          rounds?: number
          template_version_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          block_type?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          owner_id?: string
          position?: number
          prescriptions?: Json
          priority?: string
          rest_seconds?: number | null
          rounds?: number
          template_version_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "routine_blocks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_blocks_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "routine_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_template_versions: {
        Row: {
          approved_by: string | null
          archived_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          is_demo: boolean
          locked_at: string | null
          owner_id: string
          purpose: string | null
          routine_id: string
          source: Database["public"]["Enums"]["record_source"]
          status: string
          title: string
          updated_at: string
          version: number
          version_no: number
        }
        Insert: {
          approved_by?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          locked_at?: string | null
          owner_id: string
          purpose?: string | null
          routine_id: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: string
          title: string
          updated_at?: string
          version?: number
          version_no?: number
        }
        Update: {
          approved_by?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          locked_at?: string | null
          owner_id?: string
          purpose?: string | null
          routine_id?: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: string
          title?: string
          updated_at?: string
          version?: number
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "routine_template_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_template_versions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_sessions: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          owner_id: string
          planned_date: string
          source: Database["public"]["Enums"]["record_source"]
          status: string
          template_version_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          owner_id: string
          planned_date: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: string
          template_version_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          owner_id?: string
          planned_date?: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: string
          template_version_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_sessions_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "routine_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          completion: string
          created_at: string
          ended_at: string | null
          feedback: Json
          id: string
          idempotency_key: string
          is_demo: boolean
          local_date: string
          owner_id: string
          plan_snapshot: Json
          scheduled_session_id: string | null
          source: Database["public"]["Enums"]["record_source"]
          started_at: string
          template_version_id: string
          time_choice: string | null
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          completion?: string
          created_at?: string
          ended_at?: string | null
          feedback?: Json
          id?: string
          idempotency_key: string
          is_demo?: boolean
          local_date: string
          owner_id: string
          plan_snapshot: Json
          scheduled_session_id?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          started_at?: string
          template_version_id: string
          time_choice?: string | null
          timezone: string
          updated_at?: string
          version?: number
        }
        Update: {
          completion?: string
          created_at?: string
          ended_at?: string | null
          feedback?: Json
          id?: string
          idempotency_key?: string
          is_demo?: boolean
          local_date?: string
          owner_id?: string
          plan_snapshot?: Json
          scheduled_session_id?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          started_at?: string
          template_version_id?: string
          time_choice?: string | null
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_scheduled_session_id_fkey"
            columns: ["scheduled_session_id"]
            isOneToOne: false
            referencedRelation: "scheduled_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "routine_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      set_logs: {
        Row: {
          created_at: string
          entered_value: string | null
          exercise_id: string | null
          id: string
          idempotency_key: string
          is_demo: boolean
          load: number | null
          load_unit: string
          logged_at: string
          owner_id: string
          prescription_ref: string | null
          reps: number | null
          rir: number | null
          session_id: string
          set_no: number
          side: string | null
          source: Database["public"]["Enums"]["record_source"]
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          entered_value?: string | null
          exercise_id?: string | null
          id?: string
          idempotency_key: string
          is_demo?: boolean
          load?: number | null
          load_unit?: string
          logged_at?: string
          owner_id: string
          prescription_ref?: string | null
          reps?: number | null
          rir?: number | null
          session_id: string
          set_no: number
          side?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          entered_value?: string | null
          exercise_id?: string | null
          id?: string
          idempotency_key?: string
          is_demo?: boolean
          load?: number | null
          load_unit?: string
          logged_at?: string
          owner_id?: string
          prescription_ref?: string | null
          reps?: number | null
          rir?: number | null
          session_id?: string
          set_no?: number
          side?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_grant: { Args: { _grant_id: string }; Returns: undefined }
      coach_can_read: {
        Args: {
          _owner: string
          _scope: Database["public"]["Enums"]["grant_scope"]
        }
        Returns: boolean
      }
      coach_trainee_profiles: {
        Args: never
        Returns: {
          display_name: string
          id: string
          timezone: string
        }[]
      }
      create_demo_routine: { Args: { _owner: string }; Returns: undefined }
      delete_my_demo_data: { Args: never; Returns: undefined }
    }
    Enums: {
      grant_scope: "progress" | "goals_plan" | "limitations" | "measurements"
      grant_status: "invited" | "accepted" | "revoked"
      record_source: "user" | "coach" | "dillan" | "import" | "system"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      grant_scope: ["progress", "goals_plan", "limitations", "measurements"],
      grant_status: ["invited", "accepted", "revoked"],
      record_source: ["user", "coach", "dillan", "import", "system"],
    },
  },
} as const

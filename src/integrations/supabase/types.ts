export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      // --- V1 (drizzle/migrations/0006_v1_core.sql), added by hand until Lovable regenerates this file ---
      device_grants: {
        Row: {
          created_at: string;
          device_id: string;
          id: string;
          label: string;
          last_active_at: string;
          last_seen_at: string;
          revoked_at: string | null;
          session_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          id?: string;
          label?: string;
          last_active_at?: string;
          last_seen_at?: string;
          revoked_at?: string | null;
          session_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          id?: string;
          label?: string;
          last_active_at?: string;
          last_seen_at?: string;
          revoked_at?: string | null;
          session_id?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      hr_demo_samples: {
        Row: {
          bpm: number | null;
          contact: boolean | null;
          id: number;
          is_demo: boolean;
          measured_at: string;
          metric: string;
          received_at: string;
          rr_ms: number[] | null;
          schema_version: number;
          seq: number;
          session_id: string;
          source_id: string;
          stream_id: string;
          unit: string;
          user_id: string;
        };
        Insert: {
          bpm?: number | null;
          contact?: boolean | null;
          id?: number;
          is_demo?: boolean;
          measured_at: string;
          metric?: string;
          received_at?: string;
          rr_ms?: number[] | null;
          schema_version?: number;
          seq: number;
          session_id: string;
          source_id: string;
          stream_id: string;
          unit?: string;
          user_id: string;
        };
        Update: {
          bpm?: number | null;
          contact?: boolean | null;
          id?: number;
          is_demo?: boolean;
          measured_at?: string;
          metric?: string;
          received_at?: string;
          rr_ms?: number[] | null;
          schema_version?: number;
          seq?: number;
          session_id?: string;
          source_id?: string;
          stream_id?: string;
          unit?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hr_demo_samples_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hr_demo_samples_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "hr_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      hr_live: {
        Row: {
          active_session_id: string | null;
          battery_pct: number | null;
          bpm: number | null;
          connected_at: string | null;
          contact: boolean | null;
          holder_name: string;
          holder_source_id: string;
          holder_stream_id: string;
          id: string;
          is_demo: boolean;
          last_seen_at: string;
          measured_at: string | null;
          relay_mode: string;
          rev: number;
          sensor_name: string | null;
          sensor_serial: string | null;
          source_kind: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_session_id?: string | null;
          battery_pct?: number | null;
          bpm?: number | null;
          connected_at?: string | null;
          contact?: boolean | null;
          holder_name: string;
          holder_source_id: string;
          holder_stream_id: string;
          id?: string;
          is_demo?: boolean;
          last_seen_at?: string;
          measured_at?: string | null;
          relay_mode: string;
          rev?: number;
          sensor_name?: string | null;
          sensor_serial?: string | null;
          source_kind: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_session_id?: string | null;
          battery_pct?: number | null;
          bpm?: number | null;
          connected_at?: string | null;
          contact?: boolean | null;
          holder_name?: string;
          holder_source_id?: string;
          holder_stream_id?: string;
          id?: string;
          is_demo?: boolean;
          last_seen_at?: string;
          measured_at?: string | null;
          relay_mode?: string;
          rev?: number;
          sensor_name?: string | null;
          sensor_serial?: string | null;
          source_kind?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hr_live_active_session_id_fkey";
            columns: ["active_session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hr_live_holder_source_id_fkey";
            columns: ["holder_source_id"];
            isOneToOne: false;
            referencedRelation: "hr_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      hr_samples: {
        Row: {
          bpm: number | null;
          contact: boolean | null;
          id: number;
          is_demo: boolean;
          measured_at: string;
          metric: string;
          received_at: string;
          rr_ms: number[] | null;
          schema_version: number;
          seq: number;
          session_id: string;
          source_id: string;
          stream_id: string;
          unit: string;
          user_id: string;
        };
        Insert: {
          bpm?: number | null;
          contact?: boolean | null;
          id?: number;
          is_demo?: boolean;
          measured_at: string;
          metric?: string;
          received_at?: string;
          rr_ms?: number[] | null;
          schema_version?: number;
          seq: number;
          session_id: string;
          source_id: string;
          stream_id: string;
          unit?: string;
          user_id: string;
        };
        Update: {
          bpm?: number | null;
          contact?: boolean | null;
          id?: number;
          is_demo?: boolean;
          measured_at?: string;
          metric?: string;
          received_at?: string;
          rr_ms?: number[] | null;
          schema_version?: number;
          seq?: number;
          session_id?: string;
          source_id?: string;
          stream_id?: string;
          unit?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hr_samples_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hr_samples_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "hr_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      hr_sensors: {
        Row: {
          battery_read_at: string | null;
          forgotten_at: string | null;
          id: string;
          last_battery_pct: number | null;
          last_source_id: string | null;
          paired_at: string;
          sensor_kind: string;
          sensor_name: string;
          sensor_serial: string | null;
          user_id: string;
          wanted_until: string | null;
        };
        Insert: {
          battery_read_at?: string | null;
          forgotten_at?: string | null;
          id?: string;
          last_battery_pct?: number | null;
          last_source_id?: string | null;
          paired_at?: string;
          sensor_kind?: string;
          sensor_name: string;
          sensor_serial?: string | null;
          user_id: string;
          wanted_until?: string | null;
        };
        Update: {
          battery_read_at?: string | null;
          forgotten_at?: string | null;
          id?: string;
          last_battery_pct?: number | null;
          last_source_id?: string | null;
          paired_at?: string;
          sensor_kind?: string;
          sensor_name?: string;
          sensor_serial?: string | null;
          user_id?: string;
          wanted_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "hr_sensors_last_source_id_fkey";
            columns: ["last_source_id"];
            isOneToOne: false;
            referencedRelation: "hr_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      hr_sources: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          kind: string;
          last_seen_at: string | null;
          platform: string | null;
          rate_count: number;
          rate_window_at: string | null;
          revoked_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          kind: string;
          last_seen_at?: string | null;
          platform?: string | null;
          rate_count?: number;
          rate_window_at?: string | null;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          kind?: string;
          last_seen_at?: string | null;
          platform?: string | null;
          rate_count?: number;
          rate_window_at?: string | null;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      pairing_approve_failures: {
        Row: {
          at: string;
          id: number;
          user_id: string;
        };
        Insert: {
          at?: string;
          id?: number;
          user_id: string;
        };
        Update: {
          at?: string;
          id?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      pairing_challenges: {
        Row: {
          approved_user_id: string | null;
          attempts: number;
          code_hash: string;
          consumed_at: string | null;
          created_at: string;
          device_id: string;
          device_label: string;
          expires_at: string;
          for_user_id: string | null;
          grant_id: string | null;
          id: string;
          resolved_at: string | null;
          secret_hash: string;
          status: string;
        };
        Insert: {
          approved_user_id?: string | null;
          attempts?: number;
          code_hash: string;
          consumed_at?: string | null;
          created_at?: string;
          device_id: string;
          device_label?: string;
          expires_at?: string;
          for_user_id?: string | null;
          grant_id?: string | null;
          id?: string;
          resolved_at?: string | null;
          secret_hash: string;
          status?: string;
        };
        Update: {
          approved_user_id?: string | null;
          attempts?: number;
          code_hash?: string;
          consumed_at?: string | null;
          created_at?: string;
          device_id?: string;
          device_label?: string;
          expires_at?: string;
          for_user_id?: string | null;
          grant_id?: string | null;
          id?: string;
          resolved_at?: string | null;
          secret_hash?: string;
          status?: string;
        };
        Relationships: [];
      };
      session_commands: {
        Row: {
          client_at: string | null;
          command_id: string;
          error: string | null;
          expected_revision: number | null;
          id: number;
          kind: string;
          ok: boolean;
          received_at: string;
          result: Json;
          session_id: string | null;
          source: string | null;
          user_id: string;
        };
        Insert: {
          client_at?: string | null;
          command_id: string;
          error?: string | null;
          expected_revision?: number | null;
          id?: number;
          kind: string;
          ok: boolean;
          received_at?: string;
          result: Json;
          session_id?: string | null;
          source?: string | null;
          user_id: string;
        };
        Update: {
          client_at?: string | null;
          command_id?: string;
          error?: string | null;
          expected_revision?: number | null;
          id?: number;
          kind?: string;
          ok?: boolean;
          received_at?: string;
          result?: Json;
          session_id?: string | null;
          source?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_commands_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      session_notes: {
        Row: {
          created_at: string;
          revision: number;
          session_id: string;
          text: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          revision?: number;
          session_id: string;
          text?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          revision?: number;
          session_id?: string;
          text?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_notes_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      session_summaries: {
        Row: {
          active_ms: number;
          algorithm_version: number;
          coverage: number;
          created_at: string;
          elapsed_ms: number;
          ended_at: string;
          finalized_at: string | null;
          hr_finalize_dirty: boolean;
          hr_sources_used: string[];
          hr_status: string;
          local_date: string;
          measured_ms: number;
          outcome: string;
          paused_ms: number;
          session_id: string;
          start_timezone: string;
          started_at: string;
          unmeasured_ms: number;
          user_id: string;
          zone_ms: Json;
          zone_snapshot: Json | null;
        };
        Insert: {
          active_ms: number;
          algorithm_version?: number;
          coverage?: number;
          created_at?: string;
          elapsed_ms: number;
          ended_at: string;
          finalized_at?: string | null;
          hr_finalize_dirty?: boolean;
          hr_sources_used?: string[];
          hr_status: string;
          local_date: string;
          measured_ms?: number;
          outcome: string;
          paused_ms: number;
          session_id: string;
          start_timezone: string;
          started_at: string;
          unmeasured_ms: number;
          user_id: string;
          zone_ms?: Json;
          zone_snapshot?: Json | null;
        };
        Update: {
          active_ms?: number;
          algorithm_version?: number;
          coverage?: number;
          created_at?: string;
          elapsed_ms?: number;
          ended_at?: string;
          finalized_at?: string | null;
          hr_finalize_dirty?: boolean;
          hr_sources_used?: string[];
          hr_status?: string;
          local_date?: string;
          measured_ms?: number;
          outcome?: string;
          paused_ms?: number;
          session_id?: string;
          start_timezone?: string;
          started_at?: string;
          unmeasured_ms?: number;
          user_id?: string;
          zone_ms?: Json;
          zone_snapshot?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_summaries_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sessions: {
        Row: {
          created_at: string;
          cursor: number;
          ended_at: string | null;
          id: string;
          is_demo: boolean;
          last_client_at: string | null;
          last_command_id: string | null;
          last_source: string | null;
          live_data: boolean;
          outcome: string | null;
          paused_at: string | null;
          paused_ms: number;
          pauses: Json;
          rest_ends_at: string | null;
          rest_started_at: string | null;
          results: Json;
          revision: number;
          snapshot: Json;
          start_timezone: string;
          started_at: string | null;
          state: string;
          steps: Json;
          template_id: string | null;
          updated_at: string;
          user_id: string;
          zone_snapshot: Json | null;
        };
        Insert: {
          created_at?: string;
          cursor?: number;
          ended_at?: string | null;
          id?: string;
          is_demo?: boolean;
          last_client_at?: string | null;
          last_command_id?: string | null;
          last_source?: string | null;
          live_data: boolean;
          outcome?: string | null;
          paused_at?: string | null;
          paused_ms?: number;
          pauses?: Json;
          rest_ends_at?: string | null;
          rest_started_at?: string | null;
          results?: Json;
          revision?: number;
          snapshot: Json;
          start_timezone: string;
          started_at?: string | null;
          state?: string;
          steps: Json;
          template_id?: string | null;
          updated_at?: string;
          user_id: string;
          zone_snapshot?: Json | null;
        };
        Update: {
          created_at?: string;
          cursor?: number;
          ended_at?: string | null;
          id?: string;
          is_demo?: boolean;
          last_client_at?: string | null;
          last_command_id?: string | null;
          last_source?: string | null;
          live_data?: boolean;
          outcome?: string | null;
          paused_at?: string | null;
          paused_ms?: number;
          pauses?: Json;
          rest_ends_at?: string | null;
          rest_started_at?: string | null;
          results?: Json;
          revision?: number;
          snapshot?: Json;
          start_timezone?: string;
          started_at?: string | null;
          state?: string;
          steps?: Json;
          template_id?: string | null;
          updated_at?: string;
          user_id?: string;
          zone_snapshot?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sessions_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workout_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_templates: {
        Row: {
          blocks: Json;
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          revision: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          blocks: Json;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          blocks?: Json;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          revision?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      zone_configs: {
        Row: {
          b1: number;
          b2: number;
          b3: number;
          b4: number;
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          b1: number;
          b2: number;
          b3: number;
          b4: number;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Update: {
          b1?: number;
          b2?: number;
          b3?: number;
          b4?: number;
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      // --- end V1 ---
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          created_at: string;
          id: string;
          owner_id: string;
          target_id: string;
          target_table: string;
          target_version: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          id?: string;
          owner_id: string;
          target_id: string;
          target_table: string;
          target_version: number;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          id?: string;
          owner_id?: string;
          target_id?: string;
          target_table?: string;
          target_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      coach_access_grants: {
        Row: {
          accepted_at: string | null;
          coach_id: string | null;
          created_at: string;
          id: string;
          invite_email: string;
          owner_id: string;
          revoked_at: string | null;
          scopes: Database["public"]["Enums"]["grant_scope"][];
          status: Database["public"]["Enums"]["grant_status"];
          updated_at: string;
          version: number;
        };
        Insert: {
          accepted_at?: string | null;
          coach_id?: string | null;
          created_at?: string;
          id?: string;
          invite_email: string;
          owner_id: string;
          revoked_at?: string | null;
          scopes?: Database["public"]["Enums"]["grant_scope"][];
          status?: Database["public"]["Enums"]["grant_status"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          accepted_at?: string | null;
          coach_id?: string | null;
          created_at?: string;
          id?: string;
          invite_email?: string;
          owner_id?: string;
          revoked_at?: string | null;
          scopes?: Database["public"]["Enums"]["grant_scope"][];
          status?: Database["public"]["Enums"]["grant_status"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "coach_access_grants_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coach_access_grants_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      equipment_items: {
        Row: {
          archived_at: string | null;
          attachments: Json;
          available: boolean;
          capacity: number | null;
          capacity_unit: string | null;
          created_at: string;
          detail: string | null;
          id: string;
          idempotency_key: string | null;
          increments: number[];
          is_demo: boolean;
          label: string | null;
          owner_id: string;
          quantity: number;
          source: Database["public"]["Enums"]["record_source"];
          type: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          attachments?: Json;
          available?: boolean;
          capacity?: number | null;
          capacity_unit?: string | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          idempotency_key?: string | null;
          increments?: number[];
          is_demo?: boolean;
          label?: string | null;
          owner_id: string;
          quantity?: number;
          source?: Database["public"]["Enums"]["record_source"];
          type: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          attachments?: Json;
          available?: boolean;
          capacity?: number | null;
          capacity_unit?: string | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          idempotency_key?: string | null;
          increments?: number[];
          is_demo?: boolean;
          label?: string | null;
          owner_id?: string;
          quantity?: number;
          source?: Database["public"]["Enums"]["record_source"];
          type?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "equipment_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      exercises: {
        Row: {
          archived_at: string | null;
          content_source: string | null;
          created_at: string;
          cues: string[];
          equipment: string[];
          id: string;
          is_demo: boolean;
          movement: string | null;
          muscles: string[];
          name: string;
          owner_id: string | null;
          review_status: string;
          source: Database["public"]["Enums"]["record_source"];
          updated_at: string;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          content_source?: string | null;
          created_at?: string;
          cues?: string[];
          equipment?: string[];
          id?: string;
          is_demo?: boolean;
          movement?: string | null;
          muscles?: string[];
          name: string;
          owner_id?: string | null;
          review_status?: string;
          source?: Database["public"]["Enums"]["record_source"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          content_source?: string | null;
          created_at?: string;
          cues?: string[];
          equipment?: string[];
          id?: string;
          is_demo?: boolean;
          movement?: string | null;
          muscles?: string[];
          name?: string;
          owner_id?: string | null;
          review_status?: string;
          source?: Database["public"]["Enums"]["record_source"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_links: {
        Row: {
          block_id: string | null;
          created_at: string;
          exercise_id: string | null;
          goal_id: string;
          id: string;
          owner_id: string;
          relationship_note: string | null;
        };
        Insert: {
          block_id?: string | null;
          created_at?: string;
          exercise_id?: string | null;
          goal_id: string;
          id?: string;
          owner_id: string;
          relationship_note?: string | null;
        };
        Update: {
          block_id?: string | null;
          created_at?: string;
          exercise_id?: string | null;
          goal_id?: string;
          id?: string;
          owner_id?: string;
          relationship_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "goal_links_block_id_fkey";
            columns: ["block_id"];
            isOneToOne: false;
            referencedRelation: "routine_blocks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_links_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_links_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_links_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          archived_at: string | null;
          baseline_ref: string | null;
          created_at: string;
          deadline: string | null;
          id: string;
          idempotency_key: string | null;
          is_demo: boolean;
          level: string | null;
          metric: string | null;
          owner_id: string;
          parent_id: string | null;
          priority: number;
          source: Database["public"]["Enums"]["record_source"];
          status: string;
          target: number | null;
          target_unit: string | null;
          title: string;
          updated_at: string;
          user_words: string | null;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          baseline_ref?: string | null;
          created_at?: string;
          deadline?: string | null;
          id?: string;
          idempotency_key?: string | null;
          is_demo?: boolean;
          level?: string | null;
          metric?: string | null;
          owner_id: string;
          parent_id?: string | null;
          priority?: number;
          source?: Database["public"]["Enums"]["record_source"];
          status?: string;
          target?: number | null;
          target_unit?: string | null;
          title: string;
          updated_at?: string;
          user_words?: string | null;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          baseline_ref?: string | null;
          created_at?: string;
          deadline?: string | null;
          id?: string;
          idempotency_key?: string | null;
          is_demo?: boolean;
          level?: string | null;
          metric?: string | null;
          owner_id?: string;
          parent_id?: string | null;
          priority?: number;
          source?: Database["public"]["Enums"]["record_source"];
          status?: string;
          target?: number | null;
          target_unit?: string | null;
          title?: string;
          updated_at?: string;
          user_words?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      limitation_links: {
        Row: {
          block_id: string | null;
          created_at: string;
          exercise_id: string | null;
          id: string;
          limitation_id: string;
          owner_id: string;
          relationship_note: string | null;
        };
        Insert: {
          block_id?: string | null;
          created_at?: string;
          exercise_id?: string | null;
          id?: string;
          limitation_id: string;
          owner_id: string;
          relationship_note?: string | null;
        };
        Update: {
          block_id?: string | null;
          created_at?: string;
          exercise_id?: string | null;
          id?: string;
          limitation_id?: string;
          owner_id?: string;
          relationship_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "limitation_links_block_id_fkey";
            columns: ["block_id"];
            isOneToOne: false;
            referencedRelation: "routine_blocks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "limitation_links_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "limitation_links_limitation_id_fkey";
            columns: ["limitation_id"];
            isOneToOne: false;
            referencedRelation: "limitations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "limitation_links_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      limitations: {
        Row: {
          archived_at: string | null;
          category: string;
          coach_shareable: boolean;
          context: string | null;
          created_at: string;
          id: string;
          idempotency_key: string | null;
          location: string | null;
          origin: string | null;
          owner_id: string;
          review_date: string | null;
          side: string | null;
          source: Database["public"]["Enums"]["record_source"];
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          category: string;
          coach_shareable?: boolean;
          context?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          location?: string | null;
          origin?: string | null;
          owner_id: string;
          review_date?: string | null;
          side?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          category?: string;
          coach_shareable?: boolean;
          context?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          location?: string | null;
          origin?: string | null;
          owner_id?: string;
          review_date?: string | null;
          side?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "limitations_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      measurements: {
        Row: {
          archived_at: string | null;
          created_at: string;
          entered_value: string | null;
          id: string;
          method: string | null;
          observed_at: string;
          owner_id: string;
          provenance: Json;
          side: string | null;
          site: string | null;
          source: Database["public"]["Enums"]["record_source"];
          type: string;
          unit: string;
          updated_at: string;
          value: number;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          entered_value?: string | null;
          id?: string;
          method?: string | null;
          observed_at: string;
          owner_id: string;
          provenance?: Json;
          side?: string | null;
          site?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          type: string;
          unit: string;
          updated_at?: string;
          value: number;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          entered_value?: string | null;
          id?: string;
          method?: string | null;
          observed_at?: string;
          owner_id?: string;
          provenance?: Json;
          side?: string | null;
          site?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          type?: string;
          unit?: string;
          updated_at?: string;
          value?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "measurements_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          days_per_week: number | null;
          display_name: string | null;
          experience: string | null;
          id: string;
          length_unit: string;
          limitations_answer: string | null;
          onboarding_status: string;
          onboarding_step: number;
          preferences: Json;
          session_minutes: number | null;
          timezone: string;
          training_days: number[] | null;
          updated_at: string;
          version: number;
          week_start: number | null;
          weekly_goal: number;
          weight_unit: string;
        };
        Insert: {
          created_at?: string;
          days_per_week?: number | null;
          display_name?: string | null;
          experience?: string | null;
          id: string;
          length_unit?: string;
          limitations_answer?: string | null;
          onboarding_status?: string;
          onboarding_step?: number;
          preferences?: Json;
          session_minutes?: number | null;
          timezone?: string;
          training_days?: number[] | null;
          updated_at?: string;
          version?: number;
          week_start?: number | null;
          weekly_goal?: number;
          weight_unit?: string;
        };
        Update: {
          created_at?: string;
          days_per_week?: number | null;
          display_name?: string | null;
          experience?: string | null;
          id?: string;
          length_unit?: string;
          limitations_answer?: string | null;
          onboarding_status?: string;
          onboarding_step?: number;
          preferences?: Json;
          session_minutes?: number | null;
          timezone?: string;
          training_days?: number[] | null;
          updated_at?: string;
          version?: number;
          week_start?: number | null;
          weekly_goal?: number;
          weight_unit?: string;
        };
        Relationships: [];
      };
      routine_blocks: {
        Row: {
          block_type: string;
          created_at: string;
          id: string;
          is_demo: boolean;
          owner_id: string;
          position: number;
          prescriptions: Json;
          priority: string;
          rest_seconds: number | null;
          rounds: number;
          template_version_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          block_type: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          owner_id: string;
          position: number;
          prescriptions?: Json;
          priority?: string;
          rest_seconds?: number | null;
          rounds?: number;
          template_version_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          block_type?: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          owner_id?: string;
          position?: number;
          prescriptions?: Json;
          priority?: string;
          rest_seconds?: number | null;
          rounds?: number;
          template_version_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "routine_blocks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routine_blocks_template_version_id_fkey";
            columns: ["template_version_id"];
            isOneToOne: false;
            referencedRelation: "routine_template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      routine_template_versions: {
        Row: {
          approved_by: string | null;
          archived_at: string | null;
          created_at: string;
          id: string;
          idempotency_key: string | null;
          is_demo: boolean;
          locked_at: string | null;
          owner_id: string;
          purpose: string | null;
          routine_id: string;
          source: Database["public"]["Enums"]["record_source"];
          status: string;
          title: string;
          updated_at: string;
          version: number;
          version_no: number;
        };
        Insert: {
          approved_by?: string | null;
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          is_demo?: boolean;
          locked_at?: string | null;
          owner_id: string;
          purpose?: string | null;
          routine_id: string;
          source?: Database["public"]["Enums"]["record_source"];
          status?: string;
          title: string;
          updated_at?: string;
          version?: number;
          version_no?: number;
        };
        Update: {
          approved_by?: string | null;
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          is_demo?: boolean;
          locked_at?: string | null;
          owner_id?: string;
          purpose?: string | null;
          routine_id?: string;
          source?: Database["public"]["Enums"]["record_source"];
          status?: string;
          title?: string;
          updated_at?: string;
          version?: number;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "routine_template_versions_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "routine_template_versions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduled_sessions: {
        Row: {
          created_at: string;
          id: string;
          is_demo: boolean;
          owner_id: string;
          planned_date: string;
          source: Database["public"]["Enums"]["record_source"];
          status: string;
          template_version_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          owner_id: string;
          planned_date: string;
          source?: Database["public"]["Enums"]["record_source"];
          status?: string;
          template_version_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          owner_id?: string;
          planned_date?: string;
          source?: Database["public"]["Enums"]["record_source"];
          status?: string;
          template_version_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_sessions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_sessions_template_version_id_fkey";
            columns: ["template_version_id"];
            isOneToOne: false;
            referencedRelation: "routine_template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          completion: string;
          created_at: string;
          ended_at: string | null;
          feedback: Json;
          id: string;
          idempotency_key: string;
          is_demo: boolean;
          local_date: string;
          owner_id: string;
          plan_snapshot: Json;
          scheduled_session_id: string | null;
          source: Database["public"]["Enums"]["record_source"];
          started_at: string;
          template_version_id: string;
          time_choice: string | null;
          timezone: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          completion?: string;
          created_at?: string;
          ended_at?: string | null;
          feedback?: Json;
          id?: string;
          idempotency_key: string;
          is_demo?: boolean;
          local_date: string;
          owner_id: string;
          plan_snapshot: Json;
          scheduled_session_id?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          started_at?: string;
          template_version_id: string;
          time_choice?: string | null;
          timezone: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          completion?: string;
          created_at?: string;
          ended_at?: string | null;
          feedback?: Json;
          id?: string;
          idempotency_key?: string;
          is_demo?: boolean;
          local_date?: string;
          owner_id?: string;
          plan_snapshot?: Json;
          scheduled_session_id?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          started_at?: string;
          template_version_id?: string;
          time_choice?: string | null;
          timezone?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_scheduled_session_id_fkey";
            columns: ["scheduled_session_id"];
            isOneToOne: false;
            referencedRelation: "scheduled_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sessions_template_version_id_fkey";
            columns: ["template_version_id"];
            isOneToOne: false;
            referencedRelation: "routine_template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      set_logs: {
        Row: {
          created_at: string;
          entered_value: string | null;
          exercise_id: string | null;
          id: string;
          idempotency_key: string;
          is_demo: boolean;
          load: number | null;
          load_unit: string;
          logged_at: string;
          owner_id: string;
          prescription_ref: string | null;
          reps: number | null;
          rir: number | null;
          session_id: string;
          set_no: number;
          side: string | null;
          source: Database["public"]["Enums"]["record_source"];
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          entered_value?: string | null;
          exercise_id?: string | null;
          id?: string;
          idempotency_key: string;
          is_demo?: boolean;
          load?: number | null;
          load_unit?: string;
          logged_at?: string;
          owner_id: string;
          prescription_ref?: string | null;
          reps?: number | null;
          rir?: number | null;
          session_id: string;
          set_no: number;
          side?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          entered_value?: string | null;
          exercise_id?: string | null;
          id?: string;
          idempotency_key?: string;
          is_demo?: boolean;
          load?: number | null;
          load_unit?: string;
          logged_at?: string;
          owner_id?: string;
          prescription_ref?: string | null;
          reps?: number | null;
          rir?: number | null;
          session_id?: string;
          set_no?: number;
          side?: string | null;
          source?: Database["public"]["Enums"]["record_source"];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "set_logs_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "set_logs_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "set_logs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      // --- V1 RPCs (0006_v1_core.sql), added by hand ---
      approve_pairing: {
        Args: { p_code: string; p_confirm_other_user?: boolean };
        Returns: Json;
      };
      delete_my_v1_data: { Args: never; Returns: Json };
      deny_pairing: { Args: { p_code: string }; Returns: Json };
      device_grant_register: {
        Args: { p_device_id: string; p_label?: string };
        Returns: Json;
      };
      device_grant_touch: { Args: { p_device_id: string; p_active?: boolean }; Returns: Json };
      hr_forget_sensor: { Args: never; Returns: undefined };
      hr_ingest: {
        Args: {
          p_claim: boolean;
          p_connected_at: string | null;
          p_expected_user_id: string;
          p_mode: string;
          p_platform?: string | null;
          p_samples: Json;
          p_sensor: Json | null;
          p_source_id: string;
          p_source_kind: string;
          p_source_name?: string | null;
          p_stream_id: string;
        };
        Returns: Json;
      };
      hr_request: { Args: { p_minutes?: number }; Returns: undefined };
      pairing_cancel: { Args: { p_id: string; p_secret: string }; Returns: Json };
      pairing_consume: { Args: { p_id: string; p_secret: string }; Returns: Json };
      pairing_create: {
        Args: {
          p_device_id: string;
          p_device_label?: string;
          p_for_user_id?: string | null;
          p_secret_hash: string;
        };
        Returns: Json;
      };
      pairing_preview: { Args: { p_code: string }; Returns: Json };
      pairing_status: { Args: { p_id: string; p_secret: string }; Returns: Json };
      revoke_device_grant: { Args: { p_grant_id: string }; Returns: Json };
      server_time: { Args: never; Returns: string };
      session_command: {
        Args: {
          p_client_at?: string | null;
          p_command_id: string;
          p_expected_revision: number;
          p_kind: string;
          p_payload?: Json;
          p_session_id: string;
          p_source: string;
        };
        Returns: Json;
      };
      session_hr_finalize: {
        Args: {
          p_algorithm_version: number;
          p_session_id: string;
          p_sources_used?: string[];
          p_unmeasured_ms: number;
          p_zone_ms: number[];
        };
        Returns: Json;
      };
      session_note_save: {
        Args: { p_expected_revision: number; p_session_id: string; p_text: string };
        Returns: Json;
      };
      session_start: {
        Args: {
          p_client_at?: string | null;
          p_command_id: string;
          p_is_demo?: boolean;
          p_live_data: boolean;
          p_template_id: string;
          p_timezone: string;
        };
        Returns: Json;
      };
      v1_build_steps: { Args: { p_blocks: Json }; Returns: Json };
      v1_template_errors: { Args: { p_blocks: Json; p_name: string }; Returns: Json };
      // --- end V1 ---
      _resolve_exercise: {
        Args: { _demo: boolean; _name: string; _owner: string };
        Returns: string;
      };
      accept_grant: { Args: { _grant_id: string }; Returns: undefined };
      coach_can_read: {
        Args: {
          _owner: string;
          _scope: Database["public"]["Enums"]["grant_scope"];
        };
        Returns: boolean;
      };
      coach_trainee_profiles: {
        Args: never;
        Returns: {
          display_name: string;
          id: string;
          timezone: string;
        }[];
      };
      create_demo_routine: { Args: { _owner: string }; Returns: undefined };
      delete_my_demo_data: { Args: never; Returns: undefined };
      resolve_exercise_id: { Args: { _name: string }; Returns: string };
    };
    Enums: {
      grant_scope: "progress" | "goals_plan" | "limitations" | "measurements";
      grant_status: "invited" | "accepted" | "revoked";
      record_source: "user" | "coach" | "dillan" | "import" | "system";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      grant_scope: ["progress", "goals_plan", "limitations", "measurements"],
      grant_status: ["invited", "accepted", "revoked"],
      record_source: ["user", "coach", "dillan", "import", "system"],
    },
  },
} as const;

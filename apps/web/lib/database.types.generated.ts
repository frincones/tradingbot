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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          name: string
          picture_url: string | null
          public_data: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          picture_url?: string | null
          public_data?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          picture_url?: string | null
          public_data?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      agent_proposals: {
        Row: {
          agent_trace_id: string | null
          applied_at: string | null
          applied_version_id: string | null
          created_at: string
          current_config: Json | null
          description: string | null
          diff_summary: string | null
          expected_impact: string | null
          expires_at: string | null
          id: string
          proposal_type: string
          proposed_config: Json | null
          rationale: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          strategy_id: string
          title: string
          ts: string
          user_id: string
        }
        Insert: {
          agent_trace_id?: string | null
          applied_at?: string | null
          applied_version_id?: string | null
          created_at?: string
          current_config?: Json | null
          description?: string | null
          diff_summary?: string | null
          expected_impact?: string | null
          expires_at?: string | null
          id?: string
          proposal_type: string
          proposed_config?: Json | null
          rationale?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          strategy_id: string
          title: string
          ts?: string
          user_id: string
        }
        Update: {
          agent_trace_id?: string | null
          applied_at?: string | null
          applied_version_id?: string | null
          created_at?: string
          current_config?: Json | null
          description?: string | null
          diff_summary?: string | null
          expected_impact?: string | null
          expires_at?: string | null
          id?: string
          proposal_type?: string
          proposed_config?: Json | null
          rationale?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          strategy_id?: string
          title?: string
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_proposals_agent_trace_id_fkey"
            columns: ["agent_trace_id"]
            isOneToOne: false
            referencedRelation: "agent_traces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_proposals_applied_version_id_fkey"
            columns: ["applied_version_id"]
            isOneToOne: false
            referencedRelation: "strategy_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_proposals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_traces: {
        Row: {
          agent_name: string
          cost_usd: number | null
          created_at: string
          eval_feedback: string | null
          eval_score: number | null
          id: string
          input_ref: string | null
          input_summary: string | null
          intent_id: string | null
          latency_ms: number | null
          model_used: string | null
          output_json: Json
          signal_id: string | null
          strategy_id: string | null
          tokens_input: number | null
          tokens_output: number | null
          ts: string
          user_id: string
        }
        Insert: {
          agent_name: string
          cost_usd?: number | null
          created_at?: string
          eval_feedback?: string | null
          eval_score?: number | null
          id?: string
          input_ref?: string | null
          input_summary?: string | null
          intent_id?: string | null
          latency_ms?: number | null
          model_used?: string | null
          output_json: Json
          signal_id?: string | null
          strategy_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          ts?: string
          user_id: string
        }
        Update: {
          agent_name?: string
          cost_usd?: number | null
          created_at?: string
          eval_feedback?: string | null
          eval_score?: number | null
          id?: string
          input_ref?: string | null
          input_summary?: string | null
          intent_id?: string | null
          latency_ms?: number | null
          model_used?: string | null
          output_json?: Json
          signal_id?: string | null
          strategy_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_traces_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "trade_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_traces_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_traces_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          api_key_encrypted: string
          api_secret_encrypted: string | null
          created_at: string
          id: string
          is_active: boolean
          is_valid: boolean | null
          key_name: string | null
          last_used_at: string | null
          last_validated_at: string | null
          provider: string
          updated_at: string
          user_id: string
          validation_error: string | null
        }
        Insert: {
          api_key_encrypted: string
          api_secret_encrypted?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_valid?: boolean | null
          key_name?: string | null
          last_used_at?: string | null
          last_validated_at?: string | null
          provider: string
          updated_at?: string
          user_id: string
          validation_error?: string | null
        }
        Update: {
          api_key_encrypted?: string
          api_secret_encrypted?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_valid?: boolean | null
          key_name?: string | null
          last_used_at?: string | null
          last_validated_at?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
          validation_error?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          source: string
          ts: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          source?: string
          ts?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          source?: string
          ts?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          avg_loss: number | null
          avg_win: number | null
          created_at: string
          fees_paid: number
          gross_pnl: number
          id: string
          losing_trades: number
          max_drawdown: number | null
          max_position_size: number | null
          net_pnl: number
          profit_factor: number | null
          sharpe_ratio: number | null
          signals_executed: number | null
          signals_generated: number | null
          signals_rejected: number | null
          strategy_id: string | null
          total_trades: number
          trading_day: string
          updated_at: string
          user_id: string
          win_rate: number | null
          winning_trades: number
        }
        Insert: {
          avg_loss?: number | null
          avg_win?: number | null
          created_at?: string
          fees_paid?: number
          gross_pnl?: number
          id?: string
          losing_trades?: number
          max_drawdown?: number | null
          max_position_size?: number | null
          net_pnl?: number
          profit_factor?: number | null
          sharpe_ratio?: number | null
          signals_executed?: number | null
          signals_generated?: number | null
          signals_rejected?: number | null
          strategy_id?: string | null
          total_trades?: number
          trading_day: string
          updated_at?: string
          user_id: string
          win_rate?: number | null
          winning_trades?: number
        }
        Update: {
          avg_loss?: number | null
          avg_win?: number | null
          created_at?: string
          fees_paid?: number
          gross_pnl?: number
          id?: string
          losing_trades?: number
          max_drawdown?: number | null
          max_position_size?: number | null
          net_pnl?: number
          profit_factor?: number | null
          sharpe_ratio?: number | null
          signals_executed?: number | null
          signals_generated?: number | null
          signals_rejected?: number | null
          strategy_id?: string | null
          total_trades?: number
          trading_day?: string
          updated_at?: string
          user_id?: string
          win_rate?: number | null
          winning_trades?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_metrics_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      fills: {
        Row: {
          alpaca_fill_id: string | null
          created_at: string
          fee: number | null
          filled_at: string
          id: string
          notional: number
          order_id: string
          price: number
          qty: number
          raw_data: Json | null
        }
        Insert: {
          alpaca_fill_id?: string | null
          created_at?: string
          fee?: number | null
          filled_at: string
          id?: string
          notional: number
          order_id: string
          price: number
          qty: number
          raw_data?: Json | null
        }
        Update: {
          alpaca_fill_id?: string | null
          created_at?: string
          fee?: number | null
          filled_at?: string
          id?: string
          notional?: number
          order_id?: string
          price?: number
          qty?: number
          raw_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      market_data_cache: {
        Row: {
          created_at: string
          data_json: Json
          data_type: string
          expires_at: string | null
          id: string
          source: string
          symbol: string
          ts: string
        }
        Insert: {
          created_at?: string
          data_json: Json
          data_type: string
          expires_at?: string | null
          id?: string
          source?: string
          symbol: string
          ts: string
        }
        Update: {
          created_at?: string
          data_json?: Json
          data_type?: string
          expires_at?: string | null
          id?: string
          source?: string
          symbol?: string
          ts?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          alpaca_order_id: string | null
          cancelled_at: string | null
          client_order_id: string
          created_at: string
          filled_at: string | null
          filled_avg_price: number | null
          filled_qty: number | null
          id: string
          intent_id: string
          is_paper: boolean
          limit_price: number | null
          order_type: Database["public"]["Enums"]["order_type"]
          qty: number
          raw_request: Json | null
          raw_response: Json | null
          side: Database["public"]["Enums"]["order_side"]
          status: Database["public"]["Enums"]["order_status"]
          stop_price: number | null
          strategy_id: string
          submitted_at: string | null
          symbol: string
          time_in_force: Database["public"]["Enums"]["time_in_force"]
          updated_at: string
        }
        Insert: {
          alpaca_order_id?: string | null
          cancelled_at?: string | null
          client_order_id: string
          created_at?: string
          filled_at?: string | null
          filled_avg_price?: number | null
          filled_qty?: number | null
          id?: string
          intent_id: string
          is_paper?: boolean
          limit_price?: number | null
          order_type: Database["public"]["Enums"]["order_type"]
          qty: number
          raw_request?: Json | null
          raw_response?: Json | null
          side: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          stop_price?: number | null
          strategy_id: string
          submitted_at?: string | null
          symbol?: string
          time_in_force?: Database["public"]["Enums"]["time_in_force"]
          updated_at?: string
        }
        Update: {
          alpaca_order_id?: string | null
          cancelled_at?: string | null
          client_order_id?: string
          created_at?: string
          filled_at?: string | null
          filled_avg_price?: number | null
          filled_qty?: number | null
          id?: string
          intent_id?: string
          is_paper?: boolean
          limit_price?: number | null
          order_type?: Database["public"]["Enums"]["order_type"]
          qty?: number
          raw_request?: Json | null
          raw_response?: Json | null
          side?: Database["public"]["Enums"]["order_side"]
          status?: Database["public"]["Enums"]["order_status"]
          stop_price?: number | null
          strategy_id?: string
          submitted_at?: string | null
          symbol?: string
          time_in_force?: Database["public"]["Enums"]["time_in_force"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "trade_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          avg_entry_price: number | null
          close_reason: string | null
          closed_at: string | null
          created_at: string
          current_price: number | null
          entry_at: string | null
          entry_intent_id: string | null
          entry_order_id: string | null
          id: string
          is_open: boolean
          qty: number
          realized_pnl: number | null
          side: Database["public"]["Enums"]["order_side"] | null
          stop_loss_price: number | null
          strategy_id: string
          symbol: string
          take_profit_price: number | null
          unrealized_pnl: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_entry_price?: number | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          entry_at?: string | null
          entry_intent_id?: string | null
          entry_order_id?: string | null
          id?: string
          is_open?: boolean
          qty?: number
          realized_pnl?: number | null
          side?: Database["public"]["Enums"]["order_side"] | null
          stop_loss_price?: number | null
          strategy_id: string
          symbol?: string
          take_profit_price?: number | null
          unrealized_pnl?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_entry_price?: number | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          current_price?: number | null
          entry_at?: string | null
          entry_intent_id?: string | null
          entry_order_id?: string | null
          id?: string
          is_open?: boolean
          qty?: number
          realized_pnl?: number | null
          side?: Database["public"]["Enums"]["order_side"] | null
          stop_loss_price?: number | null
          strategy_id?: string
          symbol?: string
          take_profit_price?: number | null
          unrealized_pnl?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_entry_intent_id_fkey"
            columns: ["entry_intent_id"]
            isOneToOne: false
            referencedRelation: "trade_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_entry_order_id_fkey"
            columns: ["entry_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_bumpers_state: {
        Row: {
          cooldown_reason: string | null
          cooldown_until: string | null
          daily_loss_usd: number
          daily_trades_count: number
          id: string
          kill_switch_active: boolean
          kill_switch_at: string | null
          kill_switch_reason: string | null
          strategy_id: string | null
          trading_day: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cooldown_reason?: string | null
          cooldown_until?: string | null
          daily_loss_usd?: number
          daily_trades_count?: number
          id?: string
          kill_switch_active?: boolean
          kill_switch_at?: string | null
          kill_switch_reason?: string | null
          strategy_id?: string | null
          trading_day?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cooldown_reason?: string | null
          cooldown_until?: string | null
          daily_loss_usd?: number
          daily_trades_count?: number
          id?: string
          kill_switch_active?: boolean
          kill_switch_at?: string | null
          kill_switch_reason?: string | null
          strategy_id?: string | null
          trading_day?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_bumpers_state_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_events: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          action_taken: string | null
          code: string
          created_at: string
          details_json: Json | null
          id: string
          message: string | null
          severity: Database["public"]["Enums"]["risk_severity"]
          strategy_id: string | null
          ts: string
          user_id: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action_taken?: string | null
          code: string
          created_at?: string
          details_json?: Json | null
          id?: string
          message?: string | null
          severity: Database["public"]["Enums"]["risk_severity"]
          strategy_id?: string | null
          ts?: string
          user_id?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          action_taken?: string | null
          code?: string
          created_at?: string
          details_json?: Json | null
          id?: string
          message?: string | null
          severity?: Database["public"]["Enums"]["risk_severity"]
          strategy_id?: string | null
          ts?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_events_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          confirmations_json: Json
          created_at: string
          id: string
          levels_json: Json
          raw_data_ref: string | null
          scores_json: Json
          setup: Database["public"]["Enums"]["setup_type"]
          strategy_id: string
          ts: string
        }
        Insert: {
          confirmations_json?: Json
          created_at?: string
          id?: string
          levels_json?: Json
          raw_data_ref?: string | null
          scores_json?: Json
          setup: Database["public"]["Enums"]["setup_type"]
          strategy_id: string
          ts?: string
        }
        Update: {
          confirmations_json?: Json
          created_at?: string
          id?: string
          levels_json?: Json
          raw_data_ref?: string | null
          scores_json?: Json
          setup?: Database["public"]["Enums"]["setup_type"]
          strategy_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          created_at: string
          current_state: Database["public"]["Enums"]["strategy_state"]
          description: string | null
          enabled: boolean
          id: string
          mode: Database["public"]["Enums"]["strategy_mode"]
          name: string
          state_updated_at: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_state?: Database["public"]["Enums"]["strategy_state"]
          description?: string | null
          enabled?: boolean
          id?: string
          mode?: Database["public"]["Enums"]["strategy_mode"]
          name: string
          state_updated_at?: string | null
          symbol?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_state?: Database["public"]["Enums"]["strategy_state"]
          description?: string | null
          enabled?: boolean
          id?: string
          mode?: Database["public"]["Enums"]["strategy_mode"]
          name?: string
          state_updated_at?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_versions: {
        Row: {
          config_json: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          strategy_id: string
          version: number
        }
        Insert: {
          config_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          strategy_id: string
          version: number
        }
        Update: {
          config_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          strategy_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "strategy_versions_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          alpaca_key_ref: string | null
          alpaca_live_enabled: boolean
          alpaca_paper_enabled: boolean
          created_at: string
          enable_agent_explanations: boolean
          enable_agent_proposals: boolean
          enable_whale_tracking: boolean
          id: string
          notification_channels: Json | null
          notify_on_proposal: boolean
          notify_on_risk_event: boolean
          notify_on_trade: boolean
          openai_key_ref: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alpaca_key_ref?: string | null
          alpaca_live_enabled?: boolean
          alpaca_paper_enabled?: boolean
          created_at?: string
          enable_agent_explanations?: boolean
          enable_agent_proposals?: boolean
          enable_whale_tracking?: boolean
          id?: string
          notification_channels?: Json | null
          notify_on_proposal?: boolean
          notify_on_risk_event?: boolean
          notify_on_trade?: boolean
          openai_key_ref?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alpaca_key_ref?: string | null
          alpaca_live_enabled?: boolean
          alpaca_paper_enabled?: boolean
          created_at?: string
          enable_agent_explanations?: boolean
          enable_agent_proposals?: boolean
          enable_whale_tracking?: boolean
          id?: string
          notification_channels?: Json | null
          notify_on_proposal?: boolean
          notify_on_risk_event?: boolean
          notify_on_trade?: boolean
          openai_key_ref?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_intents: {
        Row: {
          approved_at: string | null
          cancelled_at: string | null
          created_at: string
          executed_at: string | null
          expires_at: string | null
          id: string
          idempotency_key: string | null
          intended_price: number | null
          qty_usd: number
          risk_decision: Json | null
          side: Database["public"]["Enums"]["order_side"]
          signal_id: string | null
          status: Database["public"]["Enums"]["intent_status"]
          strategy_id: string
        }
        Insert: {
          approved_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          intended_price?: number | null
          qty_usd: number
          risk_decision?: Json | null
          side: Database["public"]["Enums"]["order_side"]
          signal_id?: string | null
          status?: Database["public"]["Enums"]["intent_status"]
          strategy_id: string
        }
        Update: {
          approved_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          idempotency_key?: string | null
          intended_price?: number | null
          qty_usd?: number
          risk_decision?: Json | null
          side?: Database["public"]["Enums"]["order_side"]
          signal_id?: string | null
          status?: Database["public"]["Enums"]["intent_status"]
          strategy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_intents_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_intents_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      whale_events: {
        Row: {
          created_at: string
          details_json: Json | null
          direction: string | null
          event_type: string
          id: string
          snapshot_id: string | null
          symbol: string | null
          ts: string
          used_as_confirmation: boolean | null
          used_in_signal_id: string | null
          whale_id: string
        }
        Insert: {
          created_at?: string
          details_json?: Json | null
          direction?: string | null
          event_type: string
          id?: string
          snapshot_id?: string | null
          symbol?: string | null
          ts?: string
          used_as_confirmation?: boolean | null
          used_in_signal_id?: string | null
          whale_id: string
        }
        Update: {
          created_at?: string
          details_json?: Json | null
          direction?: string | null
          event_type?: string
          id?: string
          snapshot_id?: string | null
          symbol?: string | null
          ts?: string
          used_as_confirmation?: boolean | null
          used_in_signal_id?: string | null
          whale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whale_events_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "whale_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whale_events_used_in_signal_id_fkey"
            columns: ["used_in_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whale_events_whale_id_fkey"
            columns: ["whale_id"]
            isOneToOne: false
            referencedRelation: "whale_watchlist"
            referencedColumns: ["id"]
          },
        ]
      }
      whale_snapshots: {
        Row: {
          created_at: string
          delta_json: Json | null
          id: string
          is_significant: boolean | null
          significance_reason: string | null
          state_json: Json
          ts: string
          whale_id: string
        }
        Insert: {
          created_at?: string
          delta_json?: Json | null
          id?: string
          is_significant?: boolean | null
          significance_reason?: string | null
          state_json: Json
          ts?: string
          whale_id: string
        }
        Update: {
          created_at?: string
          delta_json?: Json | null
          id?: string
          is_significant?: boolean | null
          significance_reason?: string | null
          state_json?: Json
          ts?: string
          whale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whale_snapshots_whale_id_fkey"
            columns: ["whale_id"]
            isOneToOne: false
            referencedRelation: "whale_watchlist"
            referencedColumns: ["id"]
          },
        ]
      }
      whale_watchlist: {
        Row: {
          address: string
          created_at: string
          id: string
          label: string | null
          last_activity_at: string | null
          notes: string | null
          rank: number | null
          score: number | null
          source: string
          status: Database["public"]["Enums"]["whale_status"]
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          label?: string | null
          last_activity_at?: string | null
          notes?: string | null
          rank?: number | null
          score?: number | null
          source?: string
          status?: Database["public"]["Enums"]["whale_status"]
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          label?: string | null
          last_activity_at?: string | null
          notes?: string | null
          rank?: number | null
          score?: number | null
          source?: string
          status?: Database["public"]["Enums"]["whale_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_active_strategy: {
        Args: { p_user_id: string }
        Returns: {
          current_state: Database["public"]["Enums"]["strategy_state"]
          id: string
          mode: Database["public"]["Enums"]["strategy_mode"]
          name: string
          symbol: string
        }[]
      }
      get_position_summary: {
        Args: { p_user_id: string }
        Returns: {
          total_exposure: number
          total_positions: number
          unrealized_pnl: number
        }[]
      }
    }
    Enums: {
      intent_status:
        | "pending"
        | "approved"
        | "rejected"
        | "executed"
        | "cancelled"
        | "expired"
      order_side: "buy" | "sell"
      order_status:
        | "pending"
        | "submitted"
        | "accepted"
        | "filled"
        | "partially_filled"
        | "cancelled"
        | "rejected"
        | "expired"
      order_type: "market" | "limit" | "stop_limit"
      risk_severity: "info" | "warning" | "critical" | "fatal"
      setup_type: "LONG" | "SHORT" | "NONE"
      strategy_mode: "paper" | "live" | "disabled"
      strategy_state:
        | "IDLE"
        | "SETUP"
        | "TRIGGERED"
        | "ORDERING"
        | "IN_POSITION"
        | "EXITING"
        | "COOLDOWN"
      time_in_force: "gtc" | "ioc" | "day" | "fok"
      whale_status: "active" | "inactive" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          level: number | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      prefixes: {
        Row: {
          bucket_id: string
          created_at: string | null
          level: number
          name: string
          updated_at: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string | null
          level?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string | null
          level?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prefixes_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_prefixes: {
        Args: { _bucket_id: string; _name: string }
        Returns: undefined
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      delete_leaf_prefixes: {
        Args: { bucket_ids: string[]; names: string[] }
        Returns: undefined
      }
      delete_prefix: {
        Args: { _bucket_id: string; _name: string }
        Returns: boolean
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_level: { Args: { name: string }; Returns: number }
      get_prefix: { Args: { name: string }; Returns: string }
      get_prefixes: { Args: { name: string }; Returns: string[] }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          start_after?: string
        }
        Returns: {
          id: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      lock_top_prefixes: {
        Args: { bucket_ids: string[]; names: string[] }
        Returns: undefined
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_legacy_v1: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v1_optimised: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      intent_status: [
        "pending",
        "approved",
        "rejected",
        "executed",
        "cancelled",
        "expired",
      ],
      order_side: ["buy", "sell"],
      order_status: [
        "pending",
        "submitted",
        "accepted",
        "filled",
        "partially_filled",
        "cancelled",
        "rejected",
        "expired",
      ],
      order_type: ["market", "limit", "stop_limit"],
      risk_severity: ["info", "warning", "critical", "fatal"],
      setup_type: ["LONG", "SHORT", "NONE"],
      strategy_mode: ["paper", "live", "disabled"],
      strategy_state: [
        "IDLE",
        "SETUP",
        "TRIGGERED",
        "ORDERING",
        "IN_POSITION",
        "EXITING",
        "COOLDOWN",
      ],
      time_in_force: ["gtc", "ioc", "day", "fok"],
      whale_status: ["active", "inactive", "archived"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

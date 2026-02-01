/**
 * Strategy Types
 * Core types for trading strategies
 */

export type StrategyMode = 'paper' | 'live' | 'disabled';

export type StrategyState =
  | 'IDLE'
  | 'SETUP'
  | 'TRIGGERED'
  | 'ORDERING'
  | 'IN_POSITION'
  | 'EXITING'
  | 'COOLDOWN';

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  mode: StrategyMode;
  symbol: string;
  current_state: StrategyState;
  state_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StrategyVersion {
  id: string;
  strategy_id: string;
  version: number;
  config_json: StrategyConfig;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface StrategyConfig {
  entry: EntryConfig;
  exit: ExitConfig;
  execution: ExecutionConfig;
  risk: RiskConfig;
}

export interface EntryConfig {
  flush_threshold: number;
  burst_threshold: number;
  absorption_threshold: number;
  require_reclaim: boolean;
  require_whale_event: boolean;
}

export interface ExitConfig {
  tp_percent: number;
  sl_percent: number;
  time_stop_minutes: number;
  trailing_stop_enabled: boolean;
  trailing_stop_percent?: number;
}

export interface ExecutionConfig {
  order_type: 'market' | 'limit';
  limit_slippage_percent?: number;
  limit_timeout_seconds?: number;
  retry_attempts: number;
}

export interface RiskConfig {
  max_position_usd: number;
  max_daily_loss_usd: number;
  max_trades_per_day: number;
  cooldown_after_loss_minutes: number;
}

export interface CreateStrategyInput {
  name: string;
  description?: string;
  symbol?: string;
  mode?: StrategyMode;
}

export interface UpdateStrategyInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  mode?: StrategyMode;
  symbol?: string;
}


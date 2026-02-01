/**
 * KPI Types
 * Types for trading dashboard KPIs and metrics
 */

// ============================================================================
// Trade KPIs
// ============================================================================

export interface TradeKPIs {
  user_id: string;
  // Volume metrics
  total_trades: number;
  open_trades: number;
  trades_today: number;
  trades_this_week: number;
  trades_this_month: number;
  // Size metrics
  total_volume_usd: number;
  avg_position_size_usd: number;
  max_position_size_usd: number;
  // Side distribution
  long_count: number;
  short_count: number;
  long_short_ratio: number;
  // Temporal metrics
  avg_hold_time_minutes: number;
  min_hold_time_minutes: number;
  max_hold_time_minutes: number;
}

// ============================================================================
// P&L KPIs
// ============================================================================

export interface PnLKPIs {
  user_id: string;
  // Realized P&L
  total_realized_pnl_usd: number;
  realized_pnl_today: number;
  realized_pnl_this_week: number;
  realized_pnl_this_month: number;
  // Unrealized P&L
  total_unrealized_pnl_usd: number;
  // Win/Loss metrics
  closed_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  avg_win_usd: number;
  avg_loss_usd: number;
  // MFE/MAE
  avg_mfe_usd: number;
  avg_mae_usd: number;
  // Expectancy
  expectancy_usd: number;
  // Exit reasons
  sl_exits: number;
  tp_exits: number;
  manual_exits: number;
  expired_exits: number;
}

// ============================================================================
// Sentinel Agent KPIs
// ============================================================================

export interface SentinelKPIs {
  user_id: string;
  // Alert production
  total_alerts: number;
  alerts_today: number;
  alerts_this_week: number;
  // By decision
  alert_decisions: number;
  no_alert_decisions: number;
  need_data_decisions: number;
  // By recommendation
  approve_recommendations: number;
  wait_recommendations: number;
  block_recommendations: number;
  // Quality
  avg_confidence: number;
  // Status distribution
  new_alerts: number;
  viewed_alerts: number;
  actioned_alerts: number;
  dismissed_alerts: number;
  expired_alerts: number;
  // Conversion
  alerts_converted_to_trades: number;
  conversion_rate: number;
}

// ============================================================================
// Atlas Entry KPIs
// ============================================================================

export interface AtlasEntryKPIs {
  user_id: string;
  // Cycle metrics
  total_cycles: number;
  cycles_today: number;
  cycles_this_week: number;
  // Entry decisions
  total_approved: number;
  total_wait: number;
  total_blocked: number;
  approval_rate: number;
  // Global Governor
  caution_events: number;
  emergency_events: number;
  action_events: number;
  // Performance
  avg_latency_ms: number;
  total_cost_usd: number;
  total_tokens_input: number;
  total_tokens_output: number;
}

// ============================================================================
// Atlas Trade KPIs
// ============================================================================

export interface AtlasTradeKPIs {
  user_id: string;
  // Cycle metrics
  total_cycles: number;
  cycles_today: number;
  total_trades_reviewed: number;
  // Categories
  hold_count: number;
  defend_count: number;
  optimize_count: number;
  exit_count: number;
  // Actions
  total_actions_proposed: number;
  actions_executed: number;
  actions_failed: number;
  actions_skipped: number;
  // Action types
  modify_stop_actions: number;
  modify_tp_actions: number;
  close_partial_actions: number;
  close_all_actions: number;
  // Performance
  avg_latency_ms: number;
  total_cost_usd: number;
}

// ============================================================================
// Agent Costs KPIs
// ============================================================================

export interface AgentCostsKPIs {
  user_id: string;
  // Sentinel
  sentinel_cost_usd: number;
  sentinel_tokens_input: number;
  sentinel_tokens_output: number;
  sentinel_avg_latency_ms: number;
  sentinel_calls: number;
  // Total
  total_cost_usd: number;
  total_tokens_input: number;
  total_tokens_output: number;
}

// ============================================================================
// Pattern Performance
// ============================================================================

export interface PatternPerformance {
  user_id: string;
  pattern_type: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  avg_confidence: number;
  avg_hold_time_minutes: number;
}

// ============================================================================
// Equity Snapshot
// ============================================================================

export interface EquitySnapshot {
  id: string;
  user_id: string;
  ts: string;
  equity_usd: number;
  realized_pnl_cumulative: number;
  unrealized_pnl: number;
  open_positions_count: number;
}

export interface EquityCurvePoint {
  bucket: string;
  equity_usd: number;
  realized_pnl: number;
  unrealized_pnl: number;
  open_positions: number;
}

// ============================================================================
// Combined KPIs Response
// ============================================================================

export interface AllKPIs {
  trades: TradeKPIs;
  pnl: PnLKPIs;
  sentinel: SentinelKPIs;
  atlas_entry: AtlasEntryKPIs;
  atlas_trade: AtlasTradeKPIs;
  agent_costs: AgentCostsKPIs;
  pattern_performance: PatternPerformance[];
  generated_at: string;
}

// ============================================================================
// KPI Filters
// ============================================================================

export type KPIPeriod = 'today' | 'week' | 'month' | '3months' | 'all';

export interface KPIFilters {
  period: KPIPeriod;
  symbol?: string;
  side?: 'LONG' | 'SHORT';
  pattern?: string;
}

// ============================================================================
// Default values for empty KPIs
// ============================================================================

export const emptyTradeKPIs: TradeKPIs = {
  user_id: '',
  total_trades: 0,
  open_trades: 0,
  trades_today: 0,
  trades_this_week: 0,
  trades_this_month: 0,
  total_volume_usd: 0,
  avg_position_size_usd: 0,
  max_position_size_usd: 0,
  long_count: 0,
  short_count: 0,
  long_short_ratio: 0,
  avg_hold_time_minutes: 0,
  min_hold_time_minutes: 0,
  max_hold_time_minutes: 0,
};

export const emptyPnLKPIs: PnLKPIs = {
  user_id: '',
  total_realized_pnl_usd: 0,
  realized_pnl_today: 0,
  realized_pnl_this_week: 0,
  realized_pnl_this_month: 0,
  total_unrealized_pnl_usd: 0,
  closed_trades: 0,
  winning_trades: 0,
  losing_trades: 0,
  win_rate: 0,
  profit_factor: 0,
  avg_win_usd: 0,
  avg_loss_usd: 0,
  avg_mfe_usd: 0,
  avg_mae_usd: 0,
  expectancy_usd: 0,
  sl_exits: 0,
  tp_exits: 0,
  manual_exits: 0,
  expired_exits: 0,
};

export const emptySentinelKPIs: SentinelKPIs = {
  user_id: '',
  total_alerts: 0,
  alerts_today: 0,
  alerts_this_week: 0,
  alert_decisions: 0,
  no_alert_decisions: 0,
  need_data_decisions: 0,
  approve_recommendations: 0,
  wait_recommendations: 0,
  block_recommendations: 0,
  avg_confidence: 0,
  new_alerts: 0,
  viewed_alerts: 0,
  actioned_alerts: 0,
  dismissed_alerts: 0,
  expired_alerts: 0,
  alerts_converted_to_trades: 0,
  conversion_rate: 0,
};

export const emptyAtlasEntryKPIs: AtlasEntryKPIs = {
  user_id: '',
  total_cycles: 0,
  cycles_today: 0,
  cycles_this_week: 0,
  total_approved: 0,
  total_wait: 0,
  total_blocked: 0,
  approval_rate: 0,
  caution_events: 0,
  emergency_events: 0,
  action_events: 0,
  avg_latency_ms: 0,
  total_cost_usd: 0,
  total_tokens_input: 0,
  total_tokens_output: 0,
};

export const emptyAtlasTradeKPIs: AtlasTradeKPIs = {
  user_id: '',
  total_cycles: 0,
  cycles_today: 0,
  total_trades_reviewed: 0,
  hold_count: 0,
  defend_count: 0,
  optimize_count: 0,
  exit_count: 0,
  total_actions_proposed: 0,
  actions_executed: 0,
  actions_failed: 0,
  actions_skipped: 0,
  modify_stop_actions: 0,
  modify_tp_actions: 0,
  close_partial_actions: 0,
  close_all_actions: 0,
  avg_latency_ms: 0,
  total_cost_usd: 0,
};

export const emptyAgentCostsKPIs: AgentCostsKPIs = {
  user_id: '',
  sentinel_cost_usd: 0,
  sentinel_tokens_input: 0,
  sentinel_tokens_output: 0,
  sentinel_avg_latency_ms: 0,
  sentinel_calls: 0,
  total_cost_usd: 0,
  total_tokens_input: 0,
  total_tokens_output: 0,
};

export const emptyAllKPIs: AllKPIs = {
  trades: emptyTradeKPIs,
  pnl: emptyPnLKPIs,
  sentinel: emptySentinelKPIs,
  atlas_entry: emptyAtlasEntryKPIs,
  atlas_trade: emptyAtlasTradeKPIs,
  agent_costs: emptyAgentCostsKPIs,
  pattern_performance: [],
  generated_at: new Date().toISOString(),
};

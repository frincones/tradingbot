/**
 * Atlas Trade Manager Types
 * Types for the Atlas agent that manages open trades and entry gatekeeping
 */

import type { AlertPattern, AlertThesis, AlertExecutionCandidate, AlertStatus } from './alert';

// ============================================================================
// ENUMS AND BASIC TYPES
// ============================================================================

export type AtlasCycleType = 'entry' | 'trade';
export type AtlasDecisionType = 'ATLAS_DECISIONS' | 'NEED_MORE_DATA';
export type GlobalGovernorStatus = 'NORMAL' | 'CAUTION' | 'EMERGENCY';
export type GlobalGovernorAction = 'NONE' | 'PAUSE_NEW_ENTRIES' | 'REQUIRE_HUMAN_APPROVAL' | 'CLOSE_ALL';
export type EntryDecision = 'APPROVE_ENTRY' | 'WAIT' | 'BLOCK';
export type TradeCategory = 'HOLD' | 'DEFEND' | 'OPTIMIZE' | 'EXIT';
export type TradeDecision = 'APPROVE' | 'WAIT' | 'BLOCK';
export type ProgressAssessment = 'GOOD' | 'STALLING' | 'BAD';
export type ActionType = 'MODIFY_STOP' | 'MODIFY_TP' | 'CLOSE_PARTIAL' | 'CLOSE_ALL' | 'CANCEL_ORDER' | 'REPLACE_ORDER';

// ============================================================================
// TIME WINDOWS CONFIG
// ============================================================================

export interface AtlasTimeWindows {
  review_interval_sec: number;        // 600 = 10 minutes
  entry_interval_sec: number;         // 300 = 5 minutes
  windows_sec: number[];              // [600, 3600, 14400] = 10m, 1h, 4h
  hard_time_stop_default_sec: number; // 3600 = 1h default
  max_expected_trade_age_sec: number; // 14400 = 4h max
}

// ============================================================================
// LIQUIDATION METRICS
// ============================================================================

export interface LiquidationWindow {
  total_usd: number | null;
  longs_usd: number | null;
  shorts_usd: number | null;
}

export interface LiquidationMetrics {
  last_10m: LiquidationWindow;
  last_1h: LiquidationWindow;
  last_4h: LiquidationWindow;
  source: 'internal_proxy' | 'provider' | 'unknown';
}

// ============================================================================
// GUARDRAILS
// ============================================================================

export interface AtlasGuardrails {
  drift_block_usd: number;
  alpaca_spread_wait_usd: number;
  max_actions_per_cycle: number;
  max_actions_per_trade: number;
  min_seconds_between_modifications: number;
  never_widen_stop: boolean;
}

// ============================================================================
// MARKET REALTIME
// ============================================================================

export interface AtlasMarketRealtime {
  hl_mid: number;
  hl_bid: number;
  hl_ask: number;
  alpaca_mid: number | null;
  alpaca_bid: number | null;
  alpaca_ask: number | null;
  drift_usd: number;
  alpaca_spread_usd: number | null;
  funding_rate: number;
  open_interest: number;
  timestamp: number;
}

// ============================================================================
// INDICATORS INTERNAL
// ============================================================================

export interface AtlasIndicatorsInternal {
  flush_score: number;
  burst_score: number;
  reclaim_flag: boolean;
  absorption_score: number;
  whale_net_flow_usd: number;
  whale_dominant_direction: 'buying' | 'selling' | 'neutral';
  support_levels: number[];
  resistance_levels: number[];
  atr_1m: number | null;
  atr_5m: number | null;
  chop_index: number | null;
  data_freshness_ms: number;
  ws_connected: boolean;
}

// ============================================================================
// PORTFOLIO STATE
// ============================================================================

export interface AtlasPortfolioState {
  equity_usd: number;
  daily_pnl_usd: number;
  daily_dd_limit_usd: number;
  daily_trades_count: number;
  max_trades_per_day: number;
  cooldown_active: boolean;
  cooldown_until: string | null;
  kill_switch_active: boolean;
  kill_switch_reason: string | null;
  current_position_value: number;
  max_position_value: number;
}

// ============================================================================
// OPEN TRADE (for Atlas input)
// ============================================================================

export interface OpenTradeRiskPlan {
  original_stop_loss: number;
  original_take_profit: number;
  current_stop_loss: number;
  current_take_profit: number;
  time_stop_sec: number | null;
  invalidation_level: number;
  r_multiple_target: number;
}

export interface AtlasOpenTrade {
  trade_id: string;
  alert_id: string | null;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  entry_time: string;
  size_usd: number;
  current_price: number;
  unrealized_pnl_usd: number;
  unrealized_pnl_pct: number;
  mfe_usd: number;           // Max Favorable Excursion
  mae_usd: number;           // Max Adverse Excursion
  age_sec: number;
  last_review_ts: number | null;
  review_count: number;
  risk_plan: OpenTradeRiskPlan;
  pattern_type: string | null;
  thesis_title: string | null;
}

// ============================================================================
// ORDERS STATE
// ============================================================================

export interface AtlasOrderState {
  order_id: string;
  trade_id: string;
  type: 'stop' | 'take_profit' | 'entry';
  status: 'pending' | 'filled' | 'cancelled' | 'rejected';
  price: number;
  qty: number;
  filled_qty: number;
  reject_reason: string | null;
  latency_ms: number | null;
}

// ============================================================================
// ALERT CANDIDATE (for entry gatekeeping)
// ============================================================================

export interface AtlasAlertCandidate {
  candidate_id: string;
  symbol: string;
  setup: 'LONG' | 'SHORT';
  pattern_type: string;
  confidence: number;
  entry_zone: { min: number; max: number; ideal: number };
  stop_loss: number;
  take_profit: number;
  thesis_summary: string;
  risk_notes: string[];
}

// ============================================================================
// ATLAS ENTRY BUNDLE (INPUT for Entry Gatekeeping)
// ============================================================================

export interface AtlasEntryBundle {
  now: number;
  market_realtime: AtlasMarketRealtime;
  indicators_internal: AtlasIndicatorsInternal;
  portfolio_state: AtlasPortfolioState;
  alert_candidates: AtlasAlertCandidate[];
  guardrails: AtlasGuardrails;
}

// ============================================================================
// ATLAS TRADE BUNDLE (INPUT for Trade Management)
// ============================================================================

export interface AtlasTradeBundle {
  now: number;
  market_realtime: AtlasMarketRealtime;
  indicators_internal: AtlasIndicatorsInternal;
  portfolio_state: AtlasPortfolioState;
  open_trades: AtlasOpenTrade[];
  orders_state: AtlasOrderState[];
  guardrails: AtlasGuardrails;
  time_windows: AtlasTimeWindows;
  liquidation_metrics: LiquidationMetrics;
}

// ============================================================================
// ATLAS OUTPUT STRUCTURES
// ============================================================================

export interface GlobalGovernor {
  status: GlobalGovernorStatus;
  action: GlobalGovernorAction;
  reasons: string[];
}

export interface ExecutionHint {
  preferred_order_type: 'limit' | 'market' | 'stop_limit';
  entry_logic: string;
  stop_logic: string;
  tp_logic: string;
  notional_usd_cap: number | null;
  constraints: string[];
}

export interface EntryGatekeeping {
  candidate_id: string;
  setup: 'LONG' | 'SHORT';
  decision: EntryDecision;
  why: string[];
  risk_flags: string[];
  execution_hint: ExecutionHint;
  confidence: {
    score_0_100: number;
    missing_data: string[];
  };
}

export interface TradeReview {
  review_interval_sec: number;
  is_due: boolean;
  last_review_ts: number | null;
  current_review_ts: number;
  window_used_sec: number;
  progress_assessment: ProgressAssessment;
  progress_notes: string[];
}

export interface ManagementThesis {
  summary: string;
  market_read: string[];
  invalidation: string[];
}

export interface TradeActionPayload {
  venue: 'ALPACA' | 'HYPERLIQUID';
  mode: 'paper' | 'live';
  side: 'buy' | 'sell' | null;
  order_type: 'market' | 'limit' | 'stop_limit' | null;
  new_stop_price: number | null;
  new_tp_price: number | null;
  qty: number | null;
  notional_usd: number | null;
  time_in_force: 'gtc' | 'ioc' | null;
  reason: string;
}

export interface TradeAction {
  type: ActionType;
  order_id: string | null;
  payload: TradeActionPayload;
  constraints_checked: string[];
}

export interface RiskSnapshot {
  unrealized_pnl_usd: number | null;
  mfe_usd: number | null;
  mae_usd: number | null;
  age_sec: number | null;
  time_stop_sec: number | null;
  volatility_state: string | null;
  atr_1m: number | null;
  chop_risk: string | null;
  drift_usd: number | null;
  alpaca_spread: number | null;
  liq_10m_total_usd: number | null;
  liq_10m_is_proxy: boolean | null;
}

export interface TradeManagement {
  trade_id: string;
  review: TradeReview;
  category: TradeCategory;
  decision: TradeDecision;
  management_thesis: ManagementThesis;
  actions: TradeAction[];
  profit_optimization_notes: string[];
  risk_snapshot: RiskSnapshot;
  confidence: {
    score_0_100: number;
    evidence: string[];
    missing_data: string[];
  };
}

export interface InputsDigest {
  hl_mid: number | null;
  alpaca_mid: number | null;
  drift_usd: number | null;
  alpaca_spread: number | null;
  flush_score: number | null;
  burst_score: number | null;
  reclaim_flag: boolean | null;
  absorption_score: number | null;
  open_trades_count: number | null;
  daily_pnl_usd: number | null;
  liq_10m_total_usd: number | null;
}

export interface DecisionsDigest {
  entries: {
    approved: number;
    wait: number;
    blocked: number;
  };
  trade_actions_total: number;
  global_action: string;
}

export interface AnalysisLog {
  cycle_id: string;
  cycle_type: AtlasCycleType;
  inputs_digest: InputsDigest;
  decisions_digest: DecisionsDigest;
  notable_events: string[];
  data_quality: {
    ws_connected: boolean | null;
    data_freshness_ms: number | null;
    missing_fields: string[];
  };
}

export interface ImprovementItem {
  issue: string;
  proposal: string;
  expected_impact: string;
  evidence: string[];
}

export interface ImprovementPlan {
  for_alert_agent: ImprovementItem[];
  for_atlas_trade_manager: ImprovementItem[];
  for_deterministic_risk_engine: ImprovementItem[];
  priority: 'P0' | 'P1' | 'P2';
}

export interface AtlasTelemetry {
  cooldown_active: boolean | null;
  kill_switch_active: boolean | null;
  daily_dd_limit_usd: number | null;
  daily_pnl_usd: number | null;
  latency_ms_est: number | null;
}

// ============================================================================
// ATLAS ENTRY RESPONSE (OUTPUT for Entry Gatekeeping)
// ============================================================================

export interface AtlasEntryResponse {
  type: AtlasDecisionType;
  ts: number;
  symbol: string;
  global_governor: GlobalGovernor;
  entry_gatekeeping: EntryGatekeeping[];
  analysis_log: AnalysisLog;
  telemetry: AtlasTelemetry;
}

// ============================================================================
// ATLAS TRADE RESPONSE (OUTPUT for Trade Management)
// ============================================================================

export interface AtlasTradeResponse {
  type: AtlasDecisionType;
  ts: number;
  symbol: string;
  global_governor: GlobalGovernor;
  trade_management: TradeManagement[];
  analysis_log: AnalysisLog;
  improvement_plan: ImprovementPlan;
  telemetry: AtlasTelemetry;
}

// ============================================================================
// ATLAS REQUESTS
// ============================================================================

export interface AtlasEntryRequest {
  bundle: AtlasEntryBundle;
  strategy_id?: string;
}

export interface AtlasTradeRequest {
  bundle: AtlasTradeBundle;
  strategy_id?: string;
}

// ============================================================================
// DATABASE TYPES
// ============================================================================

export type AtlasDecisionStatus = 'pending' | 'executed' | 'failed' | 'skipped';

export interface AtlasReviewRecord {
  id: string;
  user_id: string;
  trade_id: string;
  review_ts: string;
  cycle_id: string;
  progress_assessment: ProgressAssessment;
  category: TradeCategory;
  mfe_usd: number;
  mae_usd: number;
  unrealized_pnl_usd: number;
  age_sec: number;
  actions_proposed: TradeAction[];
  notes_json: Record<string, unknown>;
  created_at: string;
}

export interface AtlasDecisionRecord {
  id: string;
  user_id: string;
  trade_id: string;
  review_id: string;
  action_type: ActionType;
  payload_json: TradeActionPayload;
  status: AtlasDecisionStatus;
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  created_at: string;
}

export interface AtlasCycleRecord {
  id: string;
  user_id: string;
  cycle_id: string;
  cycle_type: AtlasCycleType;
  cycle_ts: string;
  global_status: GlobalGovernorStatus;
  global_action: GlobalGovernorAction;
  global_reasons: string[];
  entries_approved: number;
  entries_wait: number;
  entries_blocked: number;
  trades_reviewed: number;
  total_actions_proposed: number;
  improvement_plan_json: ImprovementPlan | null;
  full_response_json: AtlasEntryResponse | AtlasTradeResponse;
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_usd: number | null;
  created_at: string;
}

// ============================================================================
// PAPER ORDER EXTENSIONS FOR ATLAS
// ============================================================================

export interface PaperOrderAtlasFields {
  mfe_usd: number;
  mae_usd: number;
  last_review_ts: string | null;
  review_count: number;
  original_stop_loss: number | null;
  original_take_profit: number | null;
  source: string | null;
}

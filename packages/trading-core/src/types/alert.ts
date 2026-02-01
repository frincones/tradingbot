/**
 * Alert Types
 * Types for AI-generated trading alerts from LiquidationPattern Sentinel
 */

import type { SetupType, FlushEvent, BurstEvent, AbsorptionEvent } from './signal';

// ============================================================================
// ENUMS AND BASIC TYPES
// ============================================================================

export type AlertDecision = 'ALERT' | 'NO_ALERT' | 'NEED_MORE_DATA';
export type AlertRecommendation = 'APPROVE' | 'WAIT' | 'BLOCK';
export type AlertStatus = 'new' | 'viewed' | 'dismissed' | 'actioned' | 'expired';

export type AlertPatternType =
  | 'FLUSH_RECLAIM'
  | 'BURST_CONTINUATION'
  | 'ABSORPTION_REVERSAL'
  | 'WHALE_DRIVEN'
  | 'LIQUIDATION_CASCADE';

// ============================================================================
// PATTERN DETECTION
// ============================================================================

export interface AlertPatternConfirmations {
  reclaim_confirmed: boolean;
  absorption_confirmed: boolean;
  whale_confirmed: boolean;
  volume_confirmed: boolean;
  momentum_confirmed: boolean;
}

export interface AlertPattern {
  type: AlertPatternType;
  setup: 'LONG_SETUP' | 'SHORT_SETUP';
  flush_score?: number;
  burst_score?: number;
  absorption_score?: number;
  total_score: number;
  confirmations: AlertPatternConfirmations;
  key_level?: number;
  invalidation_level?: number;
}

// ============================================================================
// INVESTMENT THESIS
// ============================================================================

export interface AlertThesisFactor {
  factor: string;
  weight: 'high' | 'medium' | 'low';
  description: string;
}

export interface AlertThesisRisk {
  factor: string;
  severity: 'high' | 'medium' | 'low';
  mitigation: string;
}

export interface AlertMarketContext {
  trend: 'bullish' | 'bearish' | 'neutral';
  volatility: 'high' | 'medium' | 'low';
  key_levels: number[];
  sentiment?: string;
}

export interface AlertThesis {
  title: string;
  summary: string;
  reasoning: string;
  supporting_factors: string[] | AlertThesisFactor[];
  risk_factors: string[] | AlertThesisRisk[];
  invalidation_conditions: string[];
  market_context?: AlertMarketContext;
}

// ============================================================================
// EXECUTION CANDIDATE
// ============================================================================

export interface AlertEntryZone {
  min: number;
  max: number;
  ideal?: number;
  entry_type?: 'limit' | 'market' | 'stop_limit';
}

export interface AlertStopLoss {
  price: number;
  percentage: number;
  reasoning?: string;
}

export interface AlertTakeProfitTarget {
  price: number;
  percentage: number;
  size_pct: number; // % of position to close at this target
}

export interface AlertPositionSize {
  suggested_pct: number; // 1-5% of portfolio
  max_usd: number;
  risk_per_trade_usd: number;
}

export interface AlertRiskMetrics {
  risk_reward_ratio: number;
  max_drawdown_pct: number;
  invalidation_price: number;
}

export interface AlertTiming {
  expected_duration: string; // '15m' | '1h' | '4h' | '1d'
  time_in_force: 'gtc' | 'ioc' | 'day';
  urgency: 'immediate' | 'wait_for_entry' | 'scalp';
}

export interface AlertExecutionCandidate {
  // Entry (backward compatible)
  entry_zone: {
    min: number;
    max: number;
    ideal?: number;
    entry_type?: 'limit' | 'market' | 'stop_limit';
  };

  // Stop Loss (backward compatible + expanded)
  stop_loss: number | AlertStopLoss;

  // Take Profit (backward compatible + expanded)
  take_profit: number;
  take_profit_targets?: AlertTakeProfitTarget[];

  // Position Sizing
  position_size_pct: number;
  position_size?: AlertPositionSize;

  // Risk Metrics
  risk_reward_ratio: number;
  max_risk_usd?: number;
  risk_metrics?: AlertRiskMetrics;

  // Timing
  timing?: AlertTiming;
  expected_duration?: string;

  // Order Config
  order_type_suggested: 'limit' | 'market' | 'stop_limit';
  time_in_force_suggested: 'gtc' | 'ioc' | 'day';
}

// ============================================================================
// AGENT ALERT (DATABASE MODEL)
// ============================================================================

export interface AgentAlert {
  id: string;
  user_id: string;
  strategy_id?: string | null;
  agent_trace_id?: string | null;
  ts: string;
  symbol: string;
  decision: AlertDecision;
  setup: SetupType;
  pattern_json: AlertPattern;
  thesis_json: AlertThesis;
  execution_json?: AlertExecutionCandidate | null;
  confidence: number;
  recommendation: AlertRecommendation;
  risk_notes: string[];
  status: AlertStatus;
  viewed_at?: string | null;
  actioned_at?: string | null;
  action_taken?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateAlertInput {
  symbol: string;
  decision: AlertDecision;
  setup: SetupType;
  pattern_json: AlertPattern;
  thesis_json: AlertThesis;
  execution_json?: AlertExecutionCandidate;
  confidence: number;
  recommendation: AlertRecommendation;
  risk_notes: string[];
  strategy_id?: string;
  agent_trace_id?: string;
  expires_at?: string;
}

// ============================================================================
// REALTIME BUNDLE (INPUT FOR SENTINEL AGENT)
// ============================================================================

export interface MarketState {
  symbol: string;
  current_price: number;
  mark_price: number;
  oracle_price: number;
  funding_rate: number;
  open_interest: number;
  volume_24h: number;
  bid_price: number;
  ask_price: number;
  spread_bps: number;
  timestamp: number;
}

export interface FeatureState {
  flush_events: FlushEvent[];
  burst_events: BurstEvent[];
  absorption_events: AbsorptionEvent[];
  recent_trades_count: number;
  recent_volume_usd: number;
}

export interface LevelsState {
  support_levels: number[];
  resistance_levels: number[];
  key_price_levels: number[];
  liquidation_clusters?: {
    side: 'longs' | 'shorts';
    zone: [number, number];
    weight: number;
  }[];
}

export interface WhaleActivity {
  recent_trades: ParsedWhaleTrade[];
  large_positions_opened: WhalePositionSnapshot[];
  total_whale_buying_usd: number;
  total_whale_selling_usd: number;
  net_whale_flow_usd: number;
  dominant_direction: 'buying' | 'selling' | 'neutral';
}

export interface ParsedWhaleTrade {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  notionalUsd: number;
  hash: string;
  time: number;
}

export interface WhalePositionSnapshot {
  address: string;
  symbol: string;
  side: 'long' | 'short';
  size_usd: number;
  entry_price: number;
  leverage: number;
}

export interface ExecutionContext {
  spread_bps: number;
  liquidity_score: number;
  slippage_estimate: number;
  best_bid: number;
  best_ask: number;
  latency_estimate_ms: number;
}

export interface RiskState {
  daily_loss_usd: number;
  daily_trades_count: number;
  max_daily_loss_usd: number;
  max_trades_per_day: number;
  cooldown_active: boolean;
  cooldown_until?: string | null;
  kill_switch_active: boolean;
  kill_switch_reason?: string | null;
  current_position_value: number;
  max_position_value: number;
}

export interface SentinelStrategyConfig {
  flush_threshold: number;
  burst_threshold: number;
  absorption_threshold: number;
  whale_confirmation_required: boolean;
  min_confidence: number;
  max_position_usd: number;
  max_daily_loss_usd: number;
  max_trades_per_day: number;
  cooldown_minutes: number;
  paper_mode: boolean;
}

export interface RealtimeBundle {
  market_state: MarketState;
  features: FeatureState;
  levels: LevelsState;
  whales: WhaleActivity;
  execution_context: ExecutionContext;
  risk_state: RiskState;
  config: SentinelStrategyConfig;
}

// ============================================================================
// SENTINEL AGENT TYPES
// ============================================================================

export interface SentinelRequest {
  bundle: RealtimeBundle;
  strategy_id?: string;
}

export interface SentinelResponse {
  decision: AlertDecision;
  pattern?: AlertPattern;
  thesis?: AlertThesis;
  execution_candidate?: AlertExecutionCandidate;
  confidence: number;
  recommendation: AlertRecommendation;
  risk_notes: string[];
  telemetry: {
    market_price: number;
    spread_bps: number;
    whale_net_flow: number;
    risk_utilization: number;
  };
}

// ============================================================================
// SENTINEL V2 TYPES - DUAL ALERT SYSTEM
// ============================================================================

/** Alert type: RISK for market warnings, TRADE for entry signals */
export type AlertType = 'RISK_ALERT' | 'TRADE_ALERT';

/** Risk alert subtypes */
export type RiskAlertType =
  | 'WHALE_SELLING_PRESSURE'    // Large whale selling detected
  | 'WHALE_BUYING_PRESSURE'     // Large whale buying detected
  | 'VOLATILITY_SPIKE'          // ATR above threshold
  | 'LIQUIDATION_CASCADE_RISK'  // Risk of cascade liquidations
  | 'MARKET_STRESS'             // Multiple stress indicators
  | 'MOMENTUM_EXHAUSTION';      // Momentum fading

/** Risk severity levels */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Timeframe for analysis context */
export type AlertTimeframe = '10m' | '1h' | '4h';

/** Snapshot of data for a specific timeframe */
export interface TimeframeSnapshot {
  whale_net_flow_usd: number;
  flush_count: number;
  burst_count: number;
  absorption_count: number;
  price_change_pct: number;
  volume_usd: number;
  volatility_atr: number;
}

/** Multi-timeframe context for analysis */
export interface TimeframeContext {
  tf_10m: TimeframeSnapshot;
  tf_1h: TimeframeSnapshot;
  tf_4h: TimeframeSnapshot;
}

/** Individual alert in the dual alert system */
export interface SentinelAlertV2 {
  type: AlertType;

  // RISK_ALERT specific fields
  risk_type?: RiskAlertType;
  risk_level?: RiskLevel;
  risk_description?: string;

  // TRADE_ALERT specific fields
  pattern?: AlertPattern;
  thesis?: AlertThesis;
  execution_candidate?: AlertExecutionCandidate;

  // Common fields
  confidence: number;
  timeframe: AlertTimeframe;
  expires_at: number; // timestamp ms
}

/** Sentinel v2 response with dual alert capability */
export interface SentinelResponseV2 extends SentinelResponse {
  /** Array of alerts (0, 1, or 2 alerts possible) */
  alerts: SentinelAlertV2[];

  /** Risk confidence score (0.0-1.0) for RISK_ALERT generation */
  risk_confidence: number;

  /** Setup confidence score (0.0-1.0) for TRADE_ALERT generation */
  setup_confidence: number;

  /** Multi-timeframe analysis context */
  timeframe_context?: TimeframeContext;

  /** If this response updates an existing alert */
  updates_alert_id?: string;
}

/** Extended bundle for v2 with multi-timeframe data */
export interface RealtimeBundleV2 extends RealtimeBundle {
  /** Multi-timeframe context */
  timeframe_context: TimeframeContext;

  /** Dynamic whale threshold based on ATR */
  dynamic_whale_threshold: number;

  /** Current ATR percentage */
  atr_percent: number;
}

/** Extended agent alert for v2 */
export interface AgentAlertV2 extends AgentAlert {
  /** Alert type: RISK or TRADE */
  alert_type: AlertType;

  /** Risk type (only for RISK_ALERT) */
  risk_type?: RiskAlertType | null;

  /** Risk level (only for RISK_ALERT) */
  risk_level?: RiskLevel | null;

  /** Timeframe of the alert */
  timeframe: AlertTimeframe;

  /** If this alert updates another */
  updates_alert_id?: string | null;

  /** Dual confidence scores */
  risk_confidence?: number | null;
  setup_confidence?: number | null;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface AlertsListResponse {
  alerts: AgentAlert[];
  total: number;
  hasMore: boolean;
}

export interface AlertUpdateResponse {
  success: boolean;
  alert: AgentAlert;
}

// ============================================================================
// PAPER TRADING TYPES
// ============================================================================

export type PaperOrderStatus = 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual' | 'expired';
export type PaperOrderExitReason = 'take_profit' | 'stop_loss' | 'manual' | 'expired' | 'tp1' | 'tp2' | 'tp3';

export interface PaperOrder {
  id: string;
  user_id: string;
  alert_id?: string | null;

  // Order Details
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  entry_time: string;
  size_usd: number;

  // Risk Management (from agent)
  stop_loss?: number | null;
  take_profit?: number | null;
  take_profit_targets?: AlertTakeProfitTarget[] | null;

  // Current State
  status: PaperOrderStatus;
  current_price?: number | null;
  unrealized_pnl?: number | null;
  unrealized_pnl_pct?: number | null;

  // Close Details
  exit_price?: number | null;
  exit_time?: string | null;
  realized_pnl?: number | null;
  realized_pnl_pct?: number | null;
  exit_reason?: PaperOrderExitReason | null;

  // Agent Metadata
  agent_confidence?: number | null;
  pattern_type?: string | null;
  thesis_title?: string | null;
  thesis_reasoning?: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreatePaperOrderInput {
  alert_id?: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  size_usd: number;
  stop_loss?: number;
  take_profit?: number;
  take_profit_targets?: AlertTakeProfitTarget[];
  agent_confidence?: number;
  pattern_type?: string;
  thesis_title?: string;
  thesis_reasoning?: string;
}

export interface ClosePaperOrderInput {
  exit_price: number;
  exit_reason: PaperOrderExitReason;
}

export interface PaperTradingStats {
  id: string;
  user_id: string;

  // Aggregated Stats
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;

  total_pnl: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  max_drawdown: number;

  // Per Pattern Stats
  pattern_stats: Record<string, {
    trades: number;
    wins: number;
    total_pnl: number;
    avg_pnl: number;
  }>;

  // Streak Info
  current_streak: number;
  best_streak: number;
  worst_streak: number;

  updated_at: string;
}

export interface PaperOrdersListResponse {
  orders: PaperOrder[];
  total: number;
  hasMore: boolean;
}

export interface PaperOrderResponse {
  success: boolean;
  order: PaperOrder;
}

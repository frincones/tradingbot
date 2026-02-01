/**
 * ============================================================================
 * TRADINGBOT TYPES
 * TypeScript types for trading tables and domain models
 * ============================================================================
 */

import type { Json } from './database.types';

// ============================================================================
// ENUM TYPES
// ============================================================================

export type StrategyMode = 'backtest' | 'paper' | 'live';
export type SetupType = 'flush' | 'burst' | 'absorption' | 'whale_follow' | 'custom';
export type IntentStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'cancelled';
export type OrderStatus = 'pending' | 'submitted' | 'accepted' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected' | 'expired';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
export type OrderSide = 'buy' | 'sell';
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok';
export type RiskSeverity = 'info' | 'warning' | 'critical';
export type WhaleStatus = 'active' | 'inactive' | 'blacklisted';
export type StrategyState = 'idle' | 'scanning' | 'signal_detected' | 'evaluating' | 'pending_order' | 'order_sent' | 'in_position' | 'monitoring' | 'closing' | 'error';

// ============================================================================
// TABLE TYPES
// ============================================================================

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  mode: StrategyMode;
  state: StrategyState;
  setup_type: SetupType;
  config: Json;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StrategyInsert {
  id?: string;
  user_id?: string;
  name: string;
  description?: string | null;
  mode?: StrategyMode;
  state?: StrategyState;
  setup_type: SetupType;
  config?: Json;
  is_active?: boolean;
}

export interface StrategyVersion {
  id: string;
  strategy_id: string;
  version: number;
  config: Json;
  created_at: string;
  created_by: string | null;
}

export interface Signal {
  id: string;
  strategy_id: string;
  symbol: string;
  setup_type: SetupType;
  side: OrderSide;
  confidence: number;
  metadata: Json;
  detected_at: string;
  expires_at: string | null;
}

export interface SignalInsert {
  id?: string;
  strategy_id: string;
  symbol: string;
  setup_type: SetupType;
  side: OrderSide;
  confidence: number;
  metadata?: Json;
  expires_at?: string | null;
}

export interface TradeIntent {
  id: string;
  strategy_id: string;
  signal_id: string | null;
  symbol: string;
  side: OrderSide;
  size_usd: number;
  status: IntentStatus;
  reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface TradeIntentInsert {
  id?: string;
  strategy_id: string;
  signal_id?: string | null;
  symbol: string;
  side: OrderSide;
  size_usd: number;
  status?: IntentStatus;
  reason?: string | null;
}

export interface Order {
  id: string;
  strategy_id: string;
  intent_id: string | null;
  broker: string;
  broker_order_id: string | null;
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: number;
  limit_price: number | null;
  stop_price: number | null;
  time_in_force: TimeInForce;
  status: OrderStatus;
  filled_quantity: number;
  avg_fill_price: number | null;
  created_at: string;
  submitted_at: string | null;
  filled_at: string | null;
}

export interface OrderInsert {
  id?: string;
  strategy_id: string;
  intent_id?: string | null;
  broker: string;
  symbol: string;
  side: OrderSide;
  order_type?: OrderType;
  quantity: number;
  limit_price?: number | null;
  stop_price?: number | null;
  time_in_force?: TimeInForce;
}

export interface Fill {
  id: string;
  order_id: string;
  broker_fill_id: string | null;
  quantity: number;
  price: number;
  commission: number;
  filled_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  strategy_id: string | null;
  symbol: string;
  side: OrderSide;
  quantity: number;
  avg_entry_price: number;
  current_price: number | null;
  unrealized_pnl: number;
  realized_pnl: number;
  is_open: boolean;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
}

export interface RiskEvent {
  id: string;
  user_id: string | null;
  strategy_id: string | null;
  severity: RiskSeverity;
  event_type: string;
  message: string;
  metadata: Json;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export interface RiskBumpersState {
  id: string;
  user_id: string;
  max_daily_loss: number;
  max_position_size: number;
  max_open_positions: number;
  max_drawdown: number;
  trading_halted: boolean;
  halt_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhaleWatchlist {
  id: string;
  user_id: string;
  address: string;
  label: string | null;
  notes: string | null;
  status: WhaleStatus;
  created_at: string;
  updated_at: string;
}

export interface WhaleSnapshot {
  id: string;
  whale_id: string;
  total_usd: number;
  positions: Json;
  captured_at: string;
}

export interface WhaleEvent {
  id: string;
  whale_id: string;
  event_type: string;
  description: string | null;
  change_usd: number | null;
  snapshot_before: Json;
  snapshot_after: Json;
  created_at: string;
}

export interface AgentTrace {
  id: string;
  user_id: string;
  agent_type: string;
  input: Json;
  output: Json;
  tokens_used: number;
  latency_ms: number;
  created_at: string;
}

export interface AgentProposal {
  id: string;
  user_id: string;
  agent_type: string;
  proposal_type: string;
  title: string;
  description: string;
  data: Json;
  status: IntentStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketDataCache {
  id: string;
  symbol: string;
  data_type: string;
  data: Json;
  source: string;
  captured_at: string;
  expires_at: string | null;
  updated_at: string;
}

export interface DailyMetrics {
  id: string;
  user_id: string;
  date: string;
  total_pnl: number;
  total_volume: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  fees_paid: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface SystemConfig {
  id: string;
  user_id: string;
  key: string;
  value: Json;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  provider: string;
  encrypted_key: string;
  encrypted_secret: string | null;
  is_paper: boolean;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  table_name: string;
  action: string;
  old_data: Json;
  new_data: Json;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ============================================================================
// REALTIME TYPES
// ============================================================================

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimePayload<T> {
  eventType: RealtimeEventType;
  new: T | null;
  old: T | null;
  errors: string[] | null;
}

export type SignalPayload = RealtimePayload<Signal>;
export type OrderPayload = RealtimePayload<Order>;
export type PositionPayload = RealtimePayload<Position>;
export type RiskEventPayload = RealtimePayload<RiskEvent>;
export type WhaleEventPayload = RealtimePayload<WhaleEvent>;
export type AgentProposalPayload = RealtimePayload<AgentProposal>;

// ============================================================================
// STRATEGY CONFIG TYPES
// ============================================================================

export interface StrategyConfig {
  default_size_usd: number;
  max_position_size_usd: number;
  take_profit_percent: number;
  stop_loss_percent: number;
  trailing_stop_enabled: boolean;
  trailing_stop_percent?: number;
  entry_conditions: EntryCondition[];
  exit_conditions: ExitCondition[];
  symbols: string[];
  timeframes: string[];
}

export interface EntryCondition {
  type: 'signal' | 'price' | 'indicator' | 'time';
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
  value: number | [number, number];
  weight: number;
}

export interface ExitCondition {
  type: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'time' | 'signal';
  value: number;
}

// ============================================================================
// MARKET DATA TYPES
// ============================================================================

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBook {
  bids: [number, number][]; // [price, size]
  asks: [number, number][]; // [price, size]
  timestamp: number;
}

export interface Trade {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface Ticker {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

// ============================================================================
// WHALE TRACKING TYPES
// ============================================================================

export interface WhalePosition {
  symbol: string;
  size: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  leverage: number;
}

export interface WhaleActivity {
  type: 'open' | 'close' | 'increase' | 'decrease';
  symbol: string;
  size_change: number;
  price: number;
  timestamp: number;
}

// ============================================================================
// SIGNAL DETECTION TYPES
// ============================================================================

export interface FlushSignal {
  type: 'flush';
  direction: 'long' | 'short';
  price_level: number;
  volume_spike: number;
  confidence: number;
  timestamp: number;
}

export interface BurstSignal {
  type: 'burst';
  direction: 'long' | 'short';
  momentum: number;
  price_change: number;
  confidence: number;
  timestamp: number;
}

export interface AbsorptionSignal {
  type: 'absorption';
  direction: 'long' | 'short';
  absorption_ratio: number;
  price_level: number;
  confidence: number;
  timestamp: number;
}

export type TradingSignal = FlushSignal | BurstSignal | AbsorptionSignal;

// ============================================================================
// WORKBENCH UI TYPES
// ============================================================================

export interface WorkbenchLayout {
  chartHeight: number;
  signalPanelWidth: number;
  activityPanelHeight: number;
  theme: 'light' | 'dark';
}

export interface WorkbenchState {
  selectedSymbol: string;
  selectedTimeframe: string;
  activeStrategy: Strategy | null;
  positions: Position[];
  signals: Signal[];
  orders: Order[];
  riskEvents: RiskEvent[];
  whaleEvents: WhaleEvent[];
  isConnected: boolean;
  lastUpdate: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// ALPACA TYPES
// ============================================================================

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  limit_price: string | null;
  stop_price: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  filled_avg_price: string | null;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  qty: string;
  avg_entry_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  side: 'long' | 'short';
}

export interface AlpacaAccount {
  id: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
}

// ============================================================================
// HYPERLIQUID TYPES
// ============================================================================

export interface HyperliquidTrade {
  coin: string;
  side: 'B' | 'S';
  px: string;
  sz: string;
  time: number;
  hash: string;
}

export interface HyperliquidOrderBook {
  coin: string;
  levels: {
    bids: Array<{ px: string; sz: string; n: number }>;
    asks: Array<{ px: string; sz: string; n: number }>;
  };
  time: number;
}

export interface HyperliquidUserState {
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string;
      positionValue: string;
      unrealizedPnl: string;
      leverage: { type: string; value: number };
    };
  }>;
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
}


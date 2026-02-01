/**
 * Order Types
 * Types for trade orders and intents
 */

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop_limit';
export type OrderStatus = 'pending' | 'submitted' | 'accepted' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected' | 'expired';
export type TimeInForce = 'gtc' | 'ioc' | 'day' | 'fok';
export type IntentStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'cancelled' | 'expired';

export interface TradeIntent {
  id: string;
  strategy_id: string;
  signal_id?: string | null;
  side: OrderSide;
  qty_usd: number;
  intended_price?: number | null;
  status: IntentStatus;
  risk_decision?: RiskDecision | null;
  created_at: string;
  approved_at?: string | null;
  executed_at?: string | null;
  cancelled_at?: string | null;
  expires_at?: string | null;
  idempotency_key?: string | null;
}

export interface RiskDecision {
  approved: boolean;
  reason?: string;
  checks_passed: string[];
  checks_failed: string[];
  risk_score: number;
}

export interface Order {
  id: string;
  intent_id: string;
  strategy_id: string;
  alpaca_order_id?: string | null;
  client_order_id: string;
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  qty: number;
  limit_price?: number | null;
  stop_price?: number | null;
  time_in_force: TimeInForce;
  status: OrderStatus;
  filled_qty: number;
  filled_avg_price?: number | null;
  is_paper: boolean;
  raw_request?: Record<string, unknown> | null;
  raw_response?: Record<string, unknown> | null;
  created_at: string;
  submitted_at?: string | null;
  filled_at?: string | null;
  cancelled_at?: string | null;
  updated_at: string;
}

export interface Fill {
  id: string;
  order_id: string;
  alpaca_fill_id?: string | null;
  price: number;
  qty: number;
  notional: number;
  fee: number;
  filled_at: string;
  created_at: string;
  raw_data?: Record<string, unknown> | null;
}

export interface CreateOrderInput {
  intent_id: string;
  strategy_id: string;
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  qty: number;
  limit_price?: number;
  stop_price?: number;
  time_in_force?: TimeInForce;
  is_paper?: boolean;
}

export interface CreateIntentInput {
  strategy_id: string;
  signal_id?: string;
  side: OrderSide;
  qty_usd: number;
  intended_price?: number;
}


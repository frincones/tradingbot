/**
 * Position Types
 * Types for trading positions
 */

import type { OrderSide } from './order';

export interface Position {
  id: string;
  strategy_id: string;
  user_id: string;
  symbol: string;
  side?: OrderSide | null;
  qty: number;
  avg_entry_price?: number | null;
  current_price?: number | null;
  unrealized_pnl: number;
  realized_pnl: number;
  entry_intent_id?: string | null;
  entry_order_id?: string | null;
  entry_at?: string | null;
  stop_loss_price?: number | null;
  take_profit_price?: number | null;
  is_open: boolean;
  closed_at?: string | null;
  close_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PositionSummary {
  total_positions: number;
  total_exposure: number;
  unrealized_pnl: number;
  realized_pnl_today: number;
}

export interface PositionUpdate {
  current_price?: number;
  stop_loss_price?: number;
  take_profit_price?: number;
}

export interface ClosePositionInput {
  position_id: string;
  close_reason: 'take_profit' | 'stop_loss' | 'manual' | 'time_stop' | 'trailing_stop';
}


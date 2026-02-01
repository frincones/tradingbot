/**
 * Whale Types
 * Types for whale tracking
 */

export type WhaleStatus = 'active' | 'inactive' | 'archived';

export interface WhaleWatchlist {
  id: string;
  user_id: string;
  address: string;
  label?: string | null;
  source: string;
  score: number;
  rank?: number | null;
  status: WhaleStatus;
  notes?: string | null;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
  last_activity_at?: string | null;
}

export interface WhaleSnapshot {
  id: string;
  whale_id: string;
  ts: string;
  state_json: WhaleState;
  delta_json?: WhaleDelta | null;
  is_significant: boolean;
  significance_reason?: string | null;
  created_at: string;
}

export interface WhaleState {
  positions: WhalePosition[];
  total_value_usd: number;
  total_pnl_usd: number;
  margin_used: number;
  margin_available: number;
}

export interface WhalePosition {
  symbol: string;
  size: number;
  side: 'long' | 'short';
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  leverage: number;
}

export interface WhaleDelta {
  positions_opened: WhalePosition[];
  positions_closed: WhalePosition[];
  positions_increased: WhalePositionChange[];
  positions_decreased: WhalePositionChange[];
  total_value_change: number;
}

export interface WhalePositionChange {
  symbol: string;
  old_size: number;
  new_size: number;
  size_change: number;
  size_change_percent: number;
}

export interface WhaleEvent {
  id: string;
  whale_id: string;
  snapshot_id?: string | null;
  ts: string;
  event_type: string;
  symbol?: string | null;
  direction?: string | null;
  details_json?: Record<string, unknown> | null;
  used_as_confirmation: boolean;
  used_in_signal_id?: string | null;
  created_at: string;
}

export interface AddWhaleInput {
  address: string;
  label?: string;
  source?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateWhaleInput {
  label?: string;
  status?: WhaleStatus;
  notes?: string;
  tags?: string[];
}


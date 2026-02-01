/**
 * Signal Types
 * Types for trading signals detected by the feature engine
 */

export type SetupType = 'LONG' | 'SHORT' | 'NONE';

export interface Signal {
  id: string;
  strategy_id: string;
  ts: string;
  setup: SetupType;
  scores_json: SignalScores;
  confirmations_json: SignalConfirmations;
  levels_json: SignalLevels;
  raw_data_ref?: string | null;
  created_at: string;
}

export interface SignalScores {
  flush_score?: number;
  burst_score?: number;
  absorption_score?: number;
  total_score: number;
  confidence: number;
}

export interface SignalConfirmations {
  reclaim_confirmed: boolean;
  whale_confirmed: boolean;
  volume_confirmed: boolean;
  momentum_confirmed: boolean;
}

export interface SignalLevels {
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  invalidation_level?: number;
}

export interface FlushEvent {
  type: 'flush';
  direction: 'long' | 'short';
  price_level: number;
  volume_spike: number;
  reclaim_detected: boolean;
  confidence: number;
  timestamp: number;
}

export interface BurstEvent {
  type: 'burst';
  direction: 'long' | 'short';
  momentum: number;
  price_change: number;
  volume_ratio: number;
  confidence: number;
  timestamp: number;
}

export interface AbsorptionEvent {
  type: 'absorption';
  direction: 'long' | 'short';
  absorption_ratio: number;
  price_level: number;
  bid_absorption: number;
  ask_absorption: number;
  confidence: number;
  timestamp: number;
}

export type TradingEvent = FlushEvent | BurstEvent | AbsorptionEvent;

export interface CreateSignalInput {
  strategy_id: string;
  setup: SetupType;
  scores_json: SignalScores;
  confirmations_json: SignalConfirmations;
  levels_json: SignalLevels;
  raw_data_ref?: string;
}


/**
 * Risk Types
 * Types for risk management
 */

export type RiskSeverity = 'info' | 'warning' | 'critical' | 'fatal';

export interface RiskEvent {
  id: string;
  strategy_id?: string | null;
  user_id?: string | null;
  ts: string;
  severity: RiskSeverity;
  code: string;
  message?: string | null;
  details_json?: Record<string, unknown> | null;
  action_taken?: string | null;
  acknowledged: boolean;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  created_at: string;
}

export interface RiskBumpersState {
  id: string;
  user_id: string;
  strategy_id?: string | null;
  trading_day: string;
  daily_loss_usd: number;
  daily_trades_count: number;
  cooldown_until?: string | null;
  cooldown_reason?: string | null;
  kill_switch_active: boolean;
  kill_switch_reason?: string | null;
  kill_switch_at?: string | null;
  updated_at: string;
}

export interface RiskCheck {
  name: string;
  passed: boolean;
  message?: string;
  value?: number;
  threshold?: number;
}

export interface RiskAssessment {
  approved: boolean;
  risk_score: number;
  checks: RiskCheck[];
  summary: string;
}


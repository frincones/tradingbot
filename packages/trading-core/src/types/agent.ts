/**
 * Agent Types
 * Types for AI agents (OpenAI)
 */

export type AgentType = 'explainer' | 'supervisor' | 'reporter' | 'optimizer';

export interface AgentTrace {
  id: string;
  user_id: string;
  strategy_id?: string | null;
  ts: string;
  agent_name: string;
  intent_id?: string | null;
  signal_id?: string | null;
  input_summary?: string | null;
  input_ref?: string | null;
  output_json: AgentOutput;
  eval_score?: number | null;
  eval_feedback?: string | null;
  tokens_input?: number | null;
  tokens_output?: number | null;
  cost_usd?: number | null;
  latency_ms?: number | null;
  model_used?: string | null;
  created_at: string;
}

export interface AgentOutput {
  type: 'explanation' | 'supervision' | 'report' | 'proposal';
  content: string;
  structured_data?: Record<string, unknown>;
  confidence?: number;
  reasoning?: string;
}

export interface AgentProposal {
  id: string;
  user_id: string;
  strategy_id: string;
  agent_trace_id?: string | null;
  ts: string;
  proposal_type: string;
  title: string;
  description?: string | null;
  current_config?: Record<string, unknown> | null;
  proposed_config?: Record<string, unknown> | null;
  diff_summary?: string | null;
  rationale?: string | null;
  expected_impact?: string | null;
  status: ProposalStatus;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  applied_at?: string | null;
  applied_version_id?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'expired';

export interface ExplanationRequest {
  type: 'signal' | 'trade' | 'risk_event' | 'position';
  entity_id: string;
  context?: string;
}

export interface SupervisionRequest {
  strategy_id: string;
  action: 'start' | 'stop' | 'review';
  context?: string;
}

export interface ReportRequest {
  user_id: string;
  report_type: 'daily' | 'weekly' | 'monthly';
  start_date: string;
  end_date: string;
}

export interface ProposalRequest {
  strategy_id: string;
  optimization_goal: 'performance' | 'risk' | 'execution';
  current_metrics: Record<string, number>;
}


/**
 * OpenAI Agent Types
 * Type definitions for AI agents
 */

export interface AgentConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export type AgentRole = 'explainer' | 'supervisor' | 'reporter' | 'optimizer';

export interface AgentContext {
  userId: string;
  strategyId?: string;
  signalId?: string;
  intentId?: string;
  positionId?: string;
}

export interface ExplanationRequest {
  type: 'signal' | 'trade' | 'risk_event' | 'position' | 'market';
  entityId?: string;
  context: string;
  data: Record<string, unknown>;
}

export interface ExplanationResponse {
  explanation: string;
  confidence: number;
  reasoning: string;
  suggestions?: string[];
}

export interface SupervisionRequest {
  strategyId: string;
  action: 'start' | 'stop' | 'review' | 'approve' | 'reject';
  currentState: string;
  context: Record<string, unknown>;
}

export interface SupervisionResponse {
  decision: 'approve' | 'reject' | 'hold';
  reason: string;
  riskScore: number;
  recommendations: string[];
}

export interface ReportRequest {
  userId: string;
  reportType: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  metrics: Record<string, number>;
  trades: Array<{
    symbol: string;
    side: string;
    pnl: number;
    timestamp: string;
  }>;
}

export interface ReportResponse {
  summary: string;
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  performance: {
    pnl: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio?: number;
  };
}

export interface OptimizationRequest {
  strategyId: string;
  currentConfig: Record<string, unknown>;
  performanceMetrics: Record<string, number>;
  recentTrades: Array<{
    pnl: number;
    holdTime: number;
    entryReason: string;
    exitReason: string;
  }>;
  goal: 'performance' | 'risk' | 'consistency';
}

export interface OptimizationResponse {
  proposedChanges: Array<{
    parameter: string;
    currentValue: unknown;
    proposedValue: unknown;
    reason: string;
  }>;
  expectedImpact: string;
  confidence: number;
  warnings: string[];
}

export interface AgentTrace {
  agentName: string;
  input: unknown;
  output: unknown;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  model: string;
  costUsd: number;
}


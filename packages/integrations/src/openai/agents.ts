/**
 * OpenAI Agents
 * AI agents for trading explanations, supervision, and optimization
 */

import OpenAI from 'openai';
import type {
  AgentConfig,
  AgentContext,
  AgentTrace,
  ExplanationRequest,
  ExplanationResponse,
  SupervisionRequest,
  SupervisionResponse,
  ReportRequest,
  ReportResponse,
  OptimizationRequest,
  OptimizationResponse,
} from './types';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.7;

// Cost per 1K tokens (GPT-4o-mini approximate)
const COST_PER_1K_INPUT = 0.00015;
const COST_PER_1K_OUTPUT = 0.0006;

export class TradingAgents {
  private openai: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: AgentConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature || DEFAULT_TEMPERATURE;
  }

  /**
   * Explain a trading event
   */
  async explain(
    request: ExplanationRequest,
    context: AgentContext
  ): Promise<{ response: ExplanationResponse; trace: AgentTrace }> {
    const startTime = Date.now();

    const systemPrompt = `You are a trading explanation agent. Your role is to explain trading events, signals, and decisions in clear, concise language. Focus on:
1. What happened and why
2. The technical factors involved
3. Risk considerations
4. What to watch for next

Be direct and factual. Avoid jargon unless necessary.`;

    const userPrompt = `Explain this ${request.type}:

Context: ${request.context}

Data:
${JSON.stringify(request.data, null, 2)}

Provide:
1. A clear explanation (2-3 paragraphs)
2. Your confidence level (0-1)
3. Key reasoning points
4. Any suggestions for the trader`;

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - startTime;
    const tokensInput = completion.usage?.prompt_tokens || 0;
    const tokensOutput = completion.usage?.completion_tokens || 0;

    const messageContent = completion.choices[0]?.message?.content || '{}';
    const rawResponse = JSON.parse(messageContent);

    const response: ExplanationResponse = {
      explanation: rawResponse.explanation || '',
      confidence: rawResponse.confidence || 0.5,
      reasoning: rawResponse.reasoning || '',
      suggestions: rawResponse.suggestions || [],
    };

    const trace: AgentTrace = {
      agentName: 'explainer',
      input: request,
      output: response,
      tokensInput,
      tokensOutput,
      latencyMs,
      model: this.model,
      costUsd: (tokensInput * COST_PER_1K_INPUT + tokensOutput * COST_PER_1K_OUTPUT) / 1000,
    };

    return { response, trace };
  }

  /**
   * Supervise a trading decision
   */
  async supervise(
    request: SupervisionRequest,
    context: AgentContext
  ): Promise<{ response: SupervisionResponse; trace: AgentTrace }> {
    const startTime = Date.now();

    const systemPrompt = `You are a trading supervision agent. Your role is to review and validate trading decisions before execution. Consider:
1. Risk management rules
2. Market conditions
3. Position sizing
4. Historical performance

Be conservative and prioritize capital preservation.`;

    const userPrompt = `Review this ${request.action} request:

Strategy: ${request.strategyId}
Current State: ${request.currentState}

Context:
${JSON.stringify(request.context, null, 2)}

Decide:
1. Whether to approve, reject, or hold
2. Your reasoning
3. Risk score (0-100, higher = more risky)
4. Recommendations`;

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.maxTokens,
      temperature: 0.3, // Lower temperature for more consistent decisions
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - startTime;
    const tokensInput = completion.usage?.prompt_tokens || 0;
    const tokensOutput = completion.usage?.completion_tokens || 0;

    const messageContent = completion.choices[0]?.message?.content || '{}';
    const rawResponse = JSON.parse(messageContent);

    const response: SupervisionResponse = {
      decision: rawResponse.decision || 'hold',
      reason: rawResponse.reason || '',
      riskScore: rawResponse.riskScore || 50,
      recommendations: rawResponse.recommendations || [],
    };

    const trace: AgentTrace = {
      agentName: 'supervisor',
      input: request,
      output: response,
      tokensInput,
      tokensOutput,
      latencyMs,
      model: this.model,
      costUsd: (tokensInput * COST_PER_1K_INPUT + tokensOutput * COST_PER_1K_OUTPUT) / 1000,
    };

    return { response, trace };
  }

  /**
   * Generate a performance report
   */
  async generateReport(
    request: ReportRequest,
    context: AgentContext
  ): Promise<{ response: ReportResponse; trace: AgentTrace }> {
    const startTime = Date.now();

    const systemPrompt = `You are a trading report generation agent. Your role is to analyze trading performance and provide actionable insights. Focus on:
1. Overall performance summary
2. Key wins and losses
3. Pattern recognition
4. Improvement opportunities

Be data-driven and objective.`;

    const userPrompt = `Generate a ${request.reportType} report:

Period: ${request.startDate} to ${request.endDate}

Metrics:
${JSON.stringify(request.metrics, null, 2)}

Trades:
${JSON.stringify(request.trades.slice(0, 50), null, 2)}

Provide:
1. Executive summary (2-3 sentences)
2. Key highlights (2-4 points)
3. Concerns or issues (if any)
4. Recommendations for improvement
5. Performance metrics summary`;

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - startTime;
    const tokensInput = completion.usage?.prompt_tokens || 0;
    const tokensOutput = completion.usage?.completion_tokens || 0;

    const messageContent = completion.choices[0]?.message?.content || '{}';
    const rawResponse = JSON.parse(messageContent);

    const response: ReportResponse = {
      summary: rawResponse.summary || '',
      highlights: rawResponse.highlights || [],
      concerns: rawResponse.concerns || [],
      recommendations: rawResponse.recommendations || [],
      performance: rawResponse.performance || {
        pnl: request.metrics.totalPnl || 0,
        winRate: request.metrics.winRate || 0,
        profitFactor: request.metrics.profitFactor || 0,
      },
    };

    const trace: AgentTrace = {
      agentName: 'reporter',
      input: request,
      output: response,
      tokensInput,
      tokensOutput,
      latencyMs,
      model: this.model,
      costUsd: (tokensInput * COST_PER_1K_INPUT + tokensOutput * COST_PER_1K_OUTPUT) / 1000,
    };

    return { response, trace };
  }

  /**
   * Optimize strategy configuration
   */
  async optimize(
    request: OptimizationRequest,
    context: AgentContext
  ): Promise<{ response: OptimizationResponse; trace: AgentTrace }> {
    const startTime = Date.now();

    const systemPrompt = `You are a trading strategy optimization agent. Your role is to suggest improvements to trading strategy parameters based on historical performance. Consider:
1. Risk-adjusted returns
2. Drawdown reduction
3. Win rate improvement
4. Execution efficiency

Be conservative with changes and explain your reasoning.`;

    const userPrompt = `Optimize this strategy configuration:

Goal: ${request.goal}

Current Config:
${JSON.stringify(request.currentConfig, null, 2)}

Performance Metrics:
${JSON.stringify(request.performanceMetrics, null, 2)}

Recent Trades:
${JSON.stringify(request.recentTrades.slice(0, 20), null, 2)}

Provide:
1. Proposed parameter changes (with reasoning)
2. Expected impact description
3. Confidence level (0-1)
4. Any warnings or considerations`;

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - startTime;
    const tokensInput = completion.usage?.prompt_tokens || 0;
    const tokensOutput = completion.usage?.completion_tokens || 0;

    const messageContent = completion.choices[0]?.message?.content || '{}';
    const rawResponse = JSON.parse(messageContent);

    const response: OptimizationResponse = {
      proposedChanges: rawResponse.proposedChanges || [],
      expectedImpact: rawResponse.expectedImpact || '',
      confidence: rawResponse.confidence || 0.5,
      warnings: rawResponse.warnings || [],
    };

    const trace: AgentTrace = {
      agentName: 'optimizer',
      input: request,
      output: response,
      tokensInput,
      tokensOutput,
      latencyMs,
      model: this.model,
      costUsd: (tokensInput * COST_PER_1K_INPUT + tokensOutput * COST_PER_1K_OUTPUT) / 1000,
    };

    return { response, trace };
  }
}

/**
 * Create trading agents from environment variables
 */
export function createTradingAgents(config?: Partial<AgentConfig>): TradingAgents {
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }

  return new TradingAgents({
    apiKey,
    model: config?.model,
    maxTokens: config?.maxTokens,
    temperature: config?.temperature,
  });
}


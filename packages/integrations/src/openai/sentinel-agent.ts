/**
 * LiquidationPattern Sentinel Agent
 * AI agent for detecting trading patterns and generating alerts with investment thesis
 * Uses OpenAI function calling for tool-based data retrieval
 */

import OpenAI from 'openai';
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { AgentConfig, AgentContext, AgentTrace } from './types';
import type {
  RealtimeBundle,
  SentinelRequest,
  SentinelResponse,
  AlertPattern,
  AlertThesis,
  AlertExecutionCandidate,
  AlertRecommendation,
  AlertDecision,
} from '@kit/trading-core';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 3000;
const SENTINEL_TEMPERATURE = 0.3; // Low temperature for consistent analysis

// Cost per 1K tokens (GPT-4o approximate)
const COST_PER_1K_INPUT = 0.005;
const COST_PER_1K_OUTPUT = 0.015;

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const SENTINEL_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_market_data',
      description:
        'Get current market data for a symbol including price, volume, funding, and open interest',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'The trading symbol (e.g., BTC, ETH, SOL)',
          },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_whale_events',
      description:
        'Get recent whale trading events for a symbol including large buys/sells',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'The trading symbol',
          },
          minutes_back: {
            type: 'number',
            description: 'Number of minutes to look back (default: 30)',
          },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_risk_state',
      description:
        'Get current risk management state including daily loss, cooldown status, and kill switch',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_price_levels',
      description:
        'Get key support/resistance price levels and liquidation clusters for a symbol',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'The trading symbol',
          },
        },
        required: ['symbol'],
      },
    },
  },
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SENTINEL_SYSTEM_PROMPT = `Eres "LiquidationPattern Sentinel" — Agente AI de trading ops, especializado en:
- Detectar patrones tipo "cazar liquidaciones" basados en flush/burst + confirmaciones (reclaim/absorción) + eventos whales.
- Generar ALERTAS accionables con una TESIS de ejecución completa para órdenes.
- Ser extremadamente riguroso: NO inventas datos. Si falta evidencia, lo declaras y reduces la confianza.
- No ejecutas órdenes. Solo generas: (a) alerta, (b) tesis detallada, (c) plan de ejecución completo, (d) gestión de riesgo.

Idioma: Español (Colombia). Estilo: técnico, claro, sin humo.
Enfoque: seguridad, control de riesgo, trazabilidad.
No es asesoría financiera. El objetivo es analítica y automatización segura.

## TAREA
1) Detecta si existe un SETUP accionable:
   - LONG_SETUP si: flush down fuerte + burst alto + (reclaim o absorción o whale buying)
   - SHORT_SETUP simétrico (burst down + whale selling)
   - WHALE_DRIVEN si: flujo neto de whales > $100k en una dirección clara
2) Evalúa calidad y riesgos:
   - Si risk_state.kill_switch_active => BLOCK
   - Si risk_state.cooldown_active => WAIT
   - Si daily_loss > 50% max_daily_loss => BLOCK
   - Si confidence < 0.6 => WAIT o NO_ALERT
3) Genera la alerta CON TODOS LOS DETALLES de ejecución

## REGLAS IMPORTANTES
- NO inventar valores que no estén en inputs
- Si faltan campos críticos, devolver "NEED_MORE_DATA"
- Tamaño sugerido: siempre <= config.max_position_usd y position_size_pct entre 1-5%
- Usar lenguaje de probabilidad/riesgo, no certeza
- SIEMPRE incluir entry_zone, stop_loss con justificación, y múltiples take profits
- SIEMPRE estimar duración esperada del trade

## OUTPUT (JSON estricto)
{
  "decision": "ALERT|NO_ALERT|NEED_MORE_DATA",
  "pattern": {
    "type": "FLUSH_RECLAIM|BURST_CONTINUATION|ABSORPTION_REVERSAL|WHALE_DRIVEN|LIQUIDATION_CASCADE",
    "setup": "LONG_SETUP|SHORT_SETUP",
    "flush_score": 0-100,
    "burst_score": 0-100,
    "absorption_score": 0-100,
    "total_score": 0-100,
    "confirmations": {
      "reclaim_confirmed": boolean,
      "absorption_confirmed": boolean,
      "whale_confirmed": boolean,
      "volume_confirmed": boolean,
      "momentum_confirmed": boolean
    },
    "key_level": number,
    "invalidation_level": number
  },
  "thesis": {
    "title": "string corto (2-4 palabras, ej: 'Whale Buying Surge')",
    "summary": "string (1-2 oraciones resumen ejecutivo)",
    "reasoning": "string (3-5 oraciones con análisis detallado)",
    "supporting_factors": [
      {"factor": "nombre", "weight": "high|medium|low", "description": "explicación breve"}
    ],
    "risk_factors": [
      {"factor": "nombre", "severity": "high|medium|low", "mitigation": "cómo mitigar"}
    ],
    "invalidation_conditions": ["condición que invalida la tesis"],
    "market_context": {
      "trend": "bullish|bearish|neutral",
      "volatility": "high|medium|low",
      "key_levels": [niveles importantes],
      "sentiment": "descripción del sentimiento"
    }
  },
  "execution_candidate": {
    "entry_zone": {
      "min": number,
      "max": number,
      "ideal": number,
      "entry_type": "limit|market|stop_limit"
    },
    "stop_loss": {
      "price": number,
      "percentage": number,
      "reasoning": "por qué este nivel"
    },
    "take_profit": number,
    "take_profit_targets": [
      {"price": number, "percentage": number, "size_pct": 50},
      {"price": number, "percentage": number, "size_pct": 50}
    ],
    "position_size_pct": 1-5,
    "position_size": {
      "suggested_pct": 1-5,
      "max_usd": number,
      "risk_per_trade_usd": number
    },
    "risk_reward_ratio": number,
    "risk_metrics": {
      "risk_reward_ratio": number,
      "max_drawdown_pct": number,
      "invalidation_price": number
    },
    "timing": {
      "expected_duration": "15m|1h|4h|1d",
      "time_in_force": "gtc|ioc|day",
      "urgency": "immediate|wait_for_entry|scalp"
    },
    "order_type_suggested": "limit|market|stop_limit",
    "time_in_force_suggested": "gtc|ioc|day"
  },
  "confidence": 0.0-1.0,
  "recommendation": "APPROVE|WAIT|BLOCK",
  "risk_notes": ["nota importante 1", "nota importante 2"],
  "telemetry": {
    "market_price": number,
    "spread_bps": number,
    "whale_net_flow": number,
    "risk_utilization": number
  }
}`;

// ============================================================================
// TOOL HANDLER TYPE
// ============================================================================

export type ToolHandler = (
  args: Record<string, unknown>
) => Promise<unknown>;

export type ToolHandlers = Map<string, ToolHandler>;

// ============================================================================
// SENTINEL AGENT CLASS
// ============================================================================

export class SentinelAgent {
  private openai: OpenAI;
  private model: string;
  private maxTokens: number;
  private toolHandlers: ToolHandlers;

  constructor(config: AgentConfig, toolHandlers?: ToolHandlers) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.toolHandlers = toolHandlers || new Map();
  }

  /**
   * Analyze market data and generate alert if pattern detected
   */
  async analyze(
    request: SentinelRequest,
    context: AgentContext
  ): Promise<{ response: SentinelResponse; trace: AgentTrace }> {
    const startTime = Date.now();
    const { bundle } = request;

    // Build user prompt with bundle data
    const userPrompt = this.buildUserPrompt(bundle);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SENTINEL_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    // Initial completion with tools available
    let completion = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      tools: SENTINEL_TOOLS,
      tool_choice: 'auto',
      max_tokens: this.maxTokens,
      temperature: SENTINEL_TEMPERATURE,
    });

    // Handle tool calls iteratively (max 5 rounds)
    let toolCallsProcessed = 0;
    const maxToolCalls = 5;

    while (
      completion.choices[0]?.message?.tool_calls &&
      toolCallsProcessed < maxToolCalls
    ) {
      const toolCalls = completion.choices[0].message.tool_calls;
      messages.push(completion.choices[0].message);

      // Process each tool call
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        let toolResult: unknown;
        if (this.toolHandlers.has(toolName)) {
          try {
            toolResult = await this.toolHandlers.get(toolName)!(toolArgs);
          } catch (error) {
            toolResult = {
              error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
          }
        } else {
          toolResult = { error: `Unknown tool: ${toolName}` };
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      toolCallsProcessed++;

      // Get next completion
      completion = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: SENTINEL_TOOLS,
        tool_choice: 'auto',
        max_tokens: this.maxTokens,
        temperature: SENTINEL_TEMPERATURE,
        response_format: { type: 'json_object' },
      });
    }

    // Final completion to get structured JSON response
    if (!completion.choices[0]?.message?.content) {
      // If we still have tool calls pending, force a final response
      messages.push(completion.choices[0]?.message || { role: 'assistant', content: '' });
      messages.push({
        role: 'user',
        content: 'Based on the data gathered, provide your final analysis as JSON.',
      });

      completion = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: SENTINEL_TEMPERATURE,
        response_format: { type: 'json_object' },
      });
    }

    // Parse response
    const latencyMs = Date.now() - startTime;
    const tokensInput = completion.usage?.prompt_tokens || 0;
    const tokensOutput = completion.usage?.completion_tokens || 0;

    const messageContent = completion.choices[0]?.message?.content || '{}';
    let rawResponse: Record<string, unknown>;

    try {
      rawResponse = JSON.parse(messageContent);
    } catch {
      rawResponse = { decision: 'NEED_MORE_DATA', risk_notes: ['Failed to parse agent response'] };
    }

    // Build typed response
    const response = this.buildResponse(rawResponse, bundle);

    // Build trace
    const trace: AgentTrace = {
      agentName: 'sentinel',
      input: { bundle_summary: this.summarizeBundle(bundle), strategy_id: request.strategy_id },
      output: response,
      tokensInput,
      tokensOutput,
      latencyMs,
      model: this.model,
      costUsd: this.calculateCost(tokensInput, tokensOutput),
    };

    return { response, trace };
  }

  /**
   * Build user prompt with market data bundle
   */
  private buildUserPrompt(bundle: RealtimeBundle): string {
    return `Analiza este bundle de datos de mercado en tiempo real y determina si hay un setup de trading de alta probabilidad:

## Estado del Mercado
- Symbol: ${bundle.market_state.symbol}
- Precio actual: $${bundle.market_state.current_price.toLocaleString()}
- Mark: $${bundle.market_state.mark_price.toLocaleString()}
- Oracle: $${bundle.market_state.oracle_price.toLocaleString()}
- Funding: ${(bundle.market_state.funding_rate * 100).toFixed(4)}%
- Open Interest: $${bundle.market_state.open_interest.toLocaleString()}
- Volumen 24h: $${bundle.market_state.volume_24h.toLocaleString()}
- Spread: ${bundle.market_state.spread_bps.toFixed(1)} bps

## Eventos Detectados
### Flush Events (${bundle.features.flush_events.length}):
${bundle.features.flush_events.map((e) => `- ${e.direction.toUpperCase()} flush @ $${e.price_level} | conf: ${(e.confidence * 100).toFixed(0)}% | reclaim: ${e.reclaim_detected}`).join('\n') || 'Ninguno'}

### Burst Events (${bundle.features.burst_events.length}):
${bundle.features.burst_events.map((e) => `- ${e.direction.toUpperCase()} burst | momentum: ${e.momentum.toFixed(2)} | conf: ${(e.confidence * 100).toFixed(0)}%`).join('\n') || 'Ninguno'}

### Absorption Events (${bundle.features.absorption_events.length}):
${bundle.features.absorption_events.map((e) => `- ${e.direction.toUpperCase()} absorption @ $${e.price_level} | ratio: ${e.absorption_ratio.toFixed(2)} | conf: ${(e.confidence * 100).toFixed(0)}%`).join('\n') || 'Ninguno'}

## Niveles Clave
- Soportes: ${bundle.levels.support_levels.map((l) => `$${l.toLocaleString()}`).join(', ') || 'N/A'}
- Resistencias: ${bundle.levels.resistance_levels.map((l) => `$${l.toLocaleString()}`).join(', ') || 'N/A'}

## Actividad Whale
- Whale buying: $${bundle.whales.total_whale_buying_usd.toLocaleString()}
- Whale selling: $${bundle.whales.total_whale_selling_usd.toLocaleString()}
- Net flow: $${bundle.whales.net_whale_flow_usd.toLocaleString()} (${bundle.whales.dominant_direction})
- Trades recientes: ${bundle.whales.recent_trades.length}

## Estado de Riesgo
- Daily loss: $${bundle.risk_state.daily_loss_usd.toFixed(2)} / $${bundle.risk_state.max_daily_loss_usd}
- Trades hoy: ${bundle.risk_state.daily_trades_count} / ${bundle.risk_state.max_trades_per_day}
- Cooldown: ${bundle.risk_state.cooldown_active ? 'ACTIVO' : 'No'}
- Kill switch: ${bundle.risk_state.kill_switch_active ? 'ACTIVO - ' + bundle.risk_state.kill_switch_reason : 'No'}
- Posición actual: $${bundle.risk_state.current_position_value.toFixed(2)} / $${bundle.risk_state.max_position_value}

## Configuración
- Flush threshold: ${bundle.config.flush_threshold}
- Burst threshold: ${bundle.config.burst_threshold}
- Absorption threshold: ${bundle.config.absorption_threshold}
- Max position: $${bundle.config.max_position_usd}
- Paper mode: ${bundle.config.paper_mode ? 'Sí' : 'No'}

Analiza y responde con tu evaluación en formato JSON.`;
  }

  /**
   * Build typed response from raw JSON
   */
  private buildResponse(
    raw: Record<string, unknown>,
    bundle: RealtimeBundle
  ): SentinelResponse {
    const decision = (raw.decision as AlertDecision) || 'NO_ALERT';
    const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0;
    const recommendation = (raw.recommendation as AlertRecommendation) || 'WAIT';

    // Handle risk state overrides
    let finalRecommendation = recommendation;
    const riskNotes: string[] = Array.isArray(raw.risk_notes)
      ? (raw.risk_notes as string[])
      : [];

    if (bundle.risk_state.kill_switch_active) {
      finalRecommendation = 'BLOCK';
      riskNotes.push('Kill switch activo: ' + (bundle.risk_state.kill_switch_reason || 'Sin razón'));
    }

    if (bundle.risk_state.cooldown_active && finalRecommendation === 'APPROVE') {
      finalRecommendation = 'WAIT';
      riskNotes.push('Cooldown activo hasta: ' + bundle.risk_state.cooldown_until);
    }

    const dailyLossRatio =
      bundle.risk_state.daily_loss_usd / bundle.risk_state.max_daily_loss_usd;
    if (dailyLossRatio > 0.5 && finalRecommendation === 'APPROVE') {
      finalRecommendation = 'WAIT';
      riskNotes.push(`Daily loss al ${(dailyLossRatio * 100).toFixed(0)}% del límite`);
    }

    return {
      decision,
      pattern: raw.pattern as AlertPattern | undefined,
      thesis: raw.thesis as AlertThesis | undefined,
      execution_candidate: raw.execution_candidate as AlertExecutionCandidate | undefined,
      confidence,
      recommendation: finalRecommendation,
      risk_notes: riskNotes,
      telemetry: {
        market_price: bundle.market_state.current_price,
        spread_bps: bundle.market_state.spread_bps,
        whale_net_flow: bundle.whales.net_whale_flow_usd,
        risk_utilization: dailyLossRatio,
      },
    };
  }

  /**
   * Summarize bundle for trace logging (reduce size)
   */
  private summarizeBundle(bundle: RealtimeBundle): Record<string, unknown> {
    return {
      symbol: bundle.market_state.symbol,
      price: bundle.market_state.current_price,
      flush_count: bundle.features.flush_events.length,
      burst_count: bundle.features.burst_events.length,
      absorption_count: bundle.features.absorption_events.length,
      whale_net_flow: bundle.whales.net_whale_flow_usd,
      risk_state: {
        daily_loss: bundle.risk_state.daily_loss_usd,
        cooldown: bundle.risk_state.cooldown_active,
        kill_switch: bundle.risk_state.kill_switch_active,
      },
    };
  }

  /**
   * Calculate cost in USD
   */
  private calculateCost(input: number, output: number): number {
    return (input * COST_PER_1K_INPUT + output * COST_PER_1K_OUTPUT) / 1000;
  }
}

/**
 * Create Sentinel agent from environment variables
 */
export function createSentinelAgent(
  config?: Partial<AgentConfig>,
  toolHandlers?: ToolHandlers
): SentinelAgent {
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }

  return new SentinelAgent(
    {
      apiKey,
      model: config?.model,
      maxTokens: config?.maxTokens,
    },
    toolHandlers
  );
}

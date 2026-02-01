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
  RealtimeBundleV2,
  SentinelRequest,
  SentinelResponse,
  SentinelResponseV2,
  SentinelAlertV2,
  AlertPattern,
  AlertThesis,
  AlertExecutionCandidate,
  AlertRecommendation,
  AlertDecision,
  AlertType,
  RiskAlertType,
  RiskLevel,
  TimeframeContext,
} from '@kit/trading-core';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 3000;
const SENTINEL_TEMPERATURE = 0.3; // Low temperature for consistent analysis

// Cost per 1K tokens (GPT-4o-mini approximate)
const COST_PER_1K_INPUT = 0.00015;
const COST_PER_1K_OUTPUT = 0.0006;

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
// SYSTEM PROMPTS
// ============================================================================

// V1 prompt (kept for backward compatibility)
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

// V2 prompt with dual analysis (RISK_ALERT + TRADE_ALERT)
const SENTINEL_V2_SYSTEM_PROMPT = `Eres "LiquidationPattern Sentinel v2" — Agente AI de trading ops con ANÁLISIS DUAL.

## CAPACIDADES
1. **RISK_ALERT**: Detectar condiciones de riesgo de mercado (presión whale, volatilidad, stress)
2. **TRADE_ALERT**: Detectar setups de trading con alta probabilidad (flush+burst+confirmaciones)

## ANÁLISIS DUAL (OBLIGATORIO)
Debes realizar DOS análisis INDEPENDIENTES en cada ciclo:

### 1. RISK ANALYSIS → risk_confidence (0.0-1.0)
Evalúa condiciones de riesgo:
- WHALE_SELLING_PRESSURE: Net flow whale < -$50K en 10m
- WHALE_BUYING_PRESSURE: Net flow whale > +$50K en 10m
- VOLATILITY_SPIKE: ATR > 1.5% (mercado muy volátil)
- MARKET_STRESS: Múltiples indicadores de tensión
- MOMENTUM_EXHAUSTION: Momentum agotándose

**Genera RISK_ALERT si risk_confidence >= 0.70**

### 2. TRADE SETUP ANALYSIS → setup_confidence (0.0-1.0)
Evalúa setups de trading:
- FLUSH_RECLAIM: Flush down + reclaim del nivel
- BURST_CONTINUATION: Burst up + continuación del momentum
- ABSORPTION_REVERSAL: Absorción de órdenes + reversión
- WHALE_DRIVEN: Flujo whale > $100K en una dirección
- LIQUIDATION_CASCADE: Cascada de liquidaciones

**Genera TRADE_ALERT si setup_confidence >= 0.80 Y confirmations >= 2**

## CONFIRMACIONES REQUERIDAS (mínimo 2 para TRADE_ALERT)
- reclaim_confirmed: Precio recuperó nivel clave
- absorption_confirmed: Órdenes grandes absorbidas
- whale_confirmed: Whale flow alineado con setup
- volume_confirmed: Volumen above average
- momentum_confirmed: Momentum en dirección del setup

## CONTEXTO MULTI-TIMEFRAME
Analiza coherencia entre timeframes (10m, 1h, 4h):
- Un TRADE_ALERT debe tener coherencia entre timeframes
- Un RISK_ALERT puede generarse en cualquier timeframe individual
- Usa el ATR de 1h para contexto de volatilidad

## REGLAS DE NEGOCIO
- Si kill_switch_active => BLOCK todo
- Si cooldown_active => WAIT para TRADE_ALERT (RISK_ALERT puede seguir)
- Si daily_loss > 50% max => WAIT para TRADE_ALERT
- NO inventar datos. Si falta evidencia, reducir confianza
- Usar threshold dinámico proporcionado en bundle

## OUTPUT JSON ESTRICTO
{
  "decision": "ALERT|NO_ALERT|NEED_MORE_DATA",

  "risk_confidence": 0.0-1.0,
  "setup_confidence": 0.0-1.0,

  "alerts": [
    {
      "type": "RISK_ALERT|TRADE_ALERT",
      "risk_type": "WHALE_SELLING_PRESSURE|WHALE_BUYING_PRESSURE|VOLATILITY_SPIKE|MARKET_STRESS|MOMENTUM_EXHAUSTION",
      "risk_level": "low|medium|high|critical",
      "risk_description": "string breve explicando el riesgo",
      "confidence": 0.0-1.0,
      "timeframe": "10m|1h|4h"
    }
  ],

  "pattern": { /* solo si hay TRADE_ALERT */ },
  "thesis": { /* solo si hay TRADE_ALERT */ },
  "execution_candidate": { /* solo si hay TRADE_ALERT */ },

  "confidence": 0.0-1.0,
  "recommendation": "APPROVE|WAIT|BLOCK",
  "risk_notes": ["nota 1", "nota 2"],
  "telemetry": {
    "market_price": number,
    "spread_bps": number,
    "whale_net_flow": number,
    "risk_utilization": number
  }
}

## EJEMPLOS

### Ejemplo 1: Solo RISK_ALERT
Input: $2M whale selling, $400K buying, sin patrón claro
Output:
{
  "decision": "ALERT",
  "risk_confidence": 0.85,
  "setup_confidence": 0.45,
  "alerts": [{
    "type": "RISK_ALERT",
    "risk_type": "WHALE_SELLING_PRESSURE",
    "risk_level": "high",
    "risk_description": "Presión vendedora masiva: $2M sells vs $400K buys",
    "confidence": 0.85,
    "timeframe": "10m"
  }],
  "recommendation": "WAIT"
}

### Ejemplo 2: TRADE_ALERT con confirmaciones
Input: Flush down fuerte + reclaim + whale buying
Output:
{
  "decision": "ALERT",
  "risk_confidence": 0.30,
  "setup_confidence": 0.85,
  "alerts": [{
    "type": "TRADE_ALERT",
    "pattern": {...},
    "thesis": {...},
    "execution_candidate": {...},
    "confidence": 0.85,
    "timeframe": "10m"
  }],
  "pattern": {...},
  "thesis": {...},
  "execution_candidate": {...},
  "recommendation": "APPROVE"
}

### Ejemplo 3: Ambas alertas
Input: Mucha volatilidad + flush reclaim claro
Output:
{
  "decision": "ALERT",
  "alerts": [
    {"type": "RISK_ALERT", "risk_type": "VOLATILITY_SPIKE", ...},
    {"type": "TRADE_ALERT", "pattern": {...}, ...}
  ],
  "risk_notes": ["CUIDADO: Setup válido pero alta volatilidad"]
}

Idioma: Español (Colombia). Estilo: técnico, claro, sin humo.`;

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
   * Build user prompt with market data bundle (V1)
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
   * Build user prompt with V2 bundle (multi-timeframe)
   */
  private buildUserPromptV2(bundle: RealtimeBundleV2): string {
    const tf = bundle.timeframe_context;

    return `Analiza este bundle V2 con contexto MULTI-TIMEFRAME y genera alertas duales (RISK + TRADE):

## Estado del Mercado
- Symbol: ${bundle.market_state.symbol}
- Precio actual: $${bundle.market_state.current_price.toLocaleString()}
- Mark: $${bundle.market_state.mark_price.toLocaleString()}
- Funding: ${(bundle.market_state.funding_rate * 100).toFixed(4)}%
- Open Interest: $${bundle.market_state.open_interest.toLocaleString()}
- Volumen 24h: $${bundle.market_state.volume_24h.toLocaleString()}

## CONTEXTO MULTI-TIMEFRAME (CRÍTICO)
### Timeframe 10 minutos:
- Whale net flow: $${tf.tf_10m.whale_net_flow_usd.toLocaleString()}
- Flush events: ${tf.tf_10m.flush_count}
- Burst events: ${tf.tf_10m.burst_count}
- Absorption events: ${tf.tf_10m.absorption_count}
- Price change: ${tf.tf_10m.price_change_pct.toFixed(2)}%
- Volume: $${tf.tf_10m.volume_usd.toLocaleString()}
- ATR: ${tf.tf_10m.volatility_atr.toFixed(2)}%

### Timeframe 1 hora:
- Whale net flow: $${tf.tf_1h.whale_net_flow_usd.toLocaleString()}
- Flush events: ${tf.tf_1h.flush_count}
- Burst events: ${tf.tf_1h.burst_count}
- Price change: ${tf.tf_1h.price_change_pct.toFixed(2)}%
- Volume: $${tf.tf_1h.volume_usd.toLocaleString()}
- ATR: ${tf.tf_1h.volatility_atr.toFixed(2)}%

### Timeframe 4 horas:
- Whale net flow: $${tf.tf_4h.whale_net_flow_usd.toLocaleString()}
- Flush events: ${tf.tf_4h.flush_count}
- Burst events: ${tf.tf_4h.burst_count}
- Price change: ${tf.tf_4h.price_change_pct.toFixed(2)}%
- Volume: $${tf.tf_4h.volume_usd.toLocaleString()}
- ATR: ${tf.tf_4h.volatility_atr.toFixed(2)}%

## Threshold Dinámico
- Whale threshold actual: $${bundle.dynamic_whale_threshold.toLocaleString()}
- ATR base: ${bundle.atr_percent.toFixed(2)}%

## Eventos Detectados (últimos 10m)
### Flush Events (${bundle.features.flush_events.length}):
${bundle.features.flush_events.slice(0, 5).map((e) => `- ${e.direction.toUpperCase()} flush @ $${e.price_level} | conf: ${(e.confidence * 100).toFixed(0)}% | reclaim: ${e.reclaim_detected}`).join('\n') || 'Ninguno'}

### Burst Events (${bundle.features.burst_events.length}):
${bundle.features.burst_events.slice(0, 5).map((e) => `- ${e.direction.toUpperCase()} burst | momentum: ${e.momentum.toFixed(2)} | conf: ${(e.confidence * 100).toFixed(0)}%`).join('\n') || 'Ninguno'}

### Absorption Events (${bundle.features.absorption_events.length}):
${bundle.features.absorption_events.slice(0, 5).map((e) => `- ${e.direction.toUpperCase()} absorption @ $${e.price_level} | ratio: ${e.absorption_ratio.toFixed(2)} | conf: ${(e.confidence * 100).toFixed(0)}%`).join('\n') || 'Ninguno'}

## Actividad Whale (agregada)
- Whale buying total: $${bundle.whales.total_whale_buying_usd.toLocaleString()}
- Whale selling total: $${bundle.whales.total_whale_selling_usd.toLocaleString()}
- Net flow: $${bundle.whales.net_whale_flow_usd.toLocaleString()} (${bundle.whales.dominant_direction})
- Trades recientes: ${bundle.whales.recent_trades.length}

## Estado de Riesgo
- Daily loss: $${bundle.risk_state.daily_loss_usd.toFixed(2)} / $${bundle.risk_state.max_daily_loss_usd}
- Trades hoy: ${bundle.risk_state.daily_trades_count} / ${bundle.risk_state.max_trades_per_day}
- Cooldown: ${bundle.risk_state.cooldown_active ? 'ACTIVO' : 'No'}
- Kill switch: ${bundle.risk_state.kill_switch_active ? 'ACTIVO - ' + bundle.risk_state.kill_switch_reason : 'No'}

## Configuración
- Flush threshold: ${bundle.config.flush_threshold}
- Burst threshold: ${bundle.config.burst_threshold}
- Max position: $${bundle.config.max_position_usd}
- Paper mode: ${bundle.config.paper_mode ? 'Sí' : 'No'}

INSTRUCCIONES:
1. Evalúa RISK_ALERT: ¿Hay condiciones de riesgo de mercado? (risk_confidence >= 0.70)
2. Evalúa TRADE_ALERT: ¿Hay setup de trading viable? (setup_confidence >= 0.80 + min 2 confirmaciones)
3. Genera el JSON con ambos scores y las alertas correspondientes

Responde en formato JSON estricto.`;
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
   * Summarize V2 bundle for trace logging
   */
  private summarizeBundleV2(bundle: RealtimeBundleV2): Record<string, unknown> {
    return {
      symbol: bundle.market_state.symbol,
      price: bundle.market_state.current_price,
      timeframe_context: {
        tf_10m_flow: bundle.timeframe_context.tf_10m.whale_net_flow_usd,
        tf_1h_flow: bundle.timeframe_context.tf_1h.whale_net_flow_usd,
        tf_4h_flow: bundle.timeframe_context.tf_4h.whale_net_flow_usd,
      },
      dynamic_threshold: bundle.dynamic_whale_threshold,
      atr_percent: bundle.atr_percent,
      flush_count: bundle.features.flush_events.length,
      burst_count: bundle.features.burst_events.length,
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

  /**
   * V2 Analysis with dual alert system (RISK_ALERT + TRADE_ALERT)
   */
  async analyzeV2(
    request: SentinelRequest & { bundle: RealtimeBundleV2 },
    context: AgentContext
  ): Promise<{ response: SentinelResponseV2; trace: AgentTrace }> {
    const startTime = Date.now();
    const { bundle } = request;

    // Build V2 user prompt with multi-timeframe context
    const userPrompt = this.buildUserPromptV2(bundle);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SENTINEL_V2_SYSTEM_PROMPT },
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

    // Final completion for JSON response
    if (!completion.choices[0]?.message?.content) {
      messages.push(completion.choices[0]?.message || { role: 'assistant', content: '' });
      messages.push({
        role: 'user',
        content: 'Based on the data gathered, provide your final dual analysis (RISK + TRADE) as JSON.',
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
      rawResponse = {
        decision: 'NEED_MORE_DATA',
        risk_confidence: 0,
        setup_confidence: 0,
        alerts: [],
        risk_notes: ['Failed to parse agent response'],
      };
    }

    // Build V2 response
    const response = this.buildResponseV2(rawResponse, bundle);

    // Build trace
    const trace: AgentTrace = {
      agentName: 'sentinel-v2',
      input: { bundle_summary: this.summarizeBundleV2(bundle), strategy_id: request.strategy_id },
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
   * Build V2 response with dual alert system
   */
  private buildResponseV2(
    raw: Record<string, unknown>,
    bundle: RealtimeBundleV2
  ): SentinelResponseV2 {
    const decision = (raw.decision as AlertDecision) || 'NO_ALERT';
    const riskConfidence = typeof raw.risk_confidence === 'number' ? raw.risk_confidence : 0;
    const setupConfidence = typeof raw.setup_confidence === 'number' ? raw.setup_confidence : 0;
    // Use setup_confidence for backward-compat confidence field
    const confidence = setupConfidence || (typeof raw.confidence === 'number' ? raw.confidence : 0);
    const recommendation = (raw.recommendation as AlertRecommendation) || 'WAIT';

    // Parse alerts array
    let alerts: SentinelAlertV2[] = [];
    if (Array.isArray(raw.alerts)) {
      alerts = (raw.alerts as Record<string, unknown>[]).map((a) => ({
        type: (a.type as AlertType) || 'TRADE_ALERT',
        risk_type: a.risk_type as RiskAlertType | undefined,
        risk_level: a.risk_level as RiskLevel | undefined,
        risk_description: a.risk_description as string | undefined,
        pattern: a.pattern as AlertPattern | undefined,
        thesis: a.thesis as AlertThesis | undefined,
        execution_candidate: a.execution_candidate as AlertExecutionCandidate | undefined,
        confidence: typeof a.confidence === 'number' ? a.confidence : 0,
        timeframe: (a.timeframe as '10m' | '1h' | '4h') || '10m',
        expires_at: Date.now() + 10 * 60 * 1000, // 10 min expiry
      }));
    }

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
      alerts,
      risk_confidence: riskConfidence,
      setup_confidence: setupConfidence,
      timeframe_context: bundle.timeframe_context,
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

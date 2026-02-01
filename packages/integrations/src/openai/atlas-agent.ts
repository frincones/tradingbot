/**
 * Atlas Trade Manager Agent
 * AI agent for managing open trades and gatekeeping new entries
 * Uses OpenAI function calling for tool-based data retrieval
 *
 * Two modes:
 * - Entry Gatekeeping (5min interval): Analyzes pending alerts and decides APPROVE/WAIT/BLOCK
 * - Trade Management (10min interval): Reviews open positions and proposes actions
 */

import OpenAI from 'openai';
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { AgentConfig, AgentContext, AgentTrace } from './types';
import type {
  AtlasEntryBundle,
  AtlasEntryRequest,
  AtlasEntryResponse,
  AtlasTradeBundle,
  AtlasTradeRequest,
  AtlasTradeResponse,
  EntryGatekeeping,
  TradeManagement,
  GlobalGovernor,
  AnalysisLog,
  ImprovementPlan,
  AtlasTelemetry,
  AtlasCycleType,
} from '@kit/trading-core';
import type { ToolHandlers } from './sentinel-agent';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 4000;
const ATLAS_TEMPERATURE = 0.2; // Low temperature for consistent decisions

// Cost per 1K tokens (GPT-4o-mini approximate)
const COST_PER_1K_INPUT = 0.00015;
const COST_PER_1K_OUTPUT = 0.0006;

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const ATLAS_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_price',
      description: 'Get the current price for a symbol from multiple venues',
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
      name: 'get_liquidation_data',
      description: 'Get recent liquidation data for the market',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'The trading symbol',
          },
          window_minutes: {
            type: 'number',
            description: 'Time window in minutes (10, 60, or 240)',
          },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_status',
      description: 'Get the current status of an order',
      parameters: {
        type: 'object',
        properties: {
          order_id: {
            type: 'string',
            description: 'The order ID to check',
          },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_position_details',
      description: 'Get detailed position information including entry, PnL, and risk metrics',
      parameters: {
        type: 'object',
        properties: {
          trade_id: {
            type: 'string',
            description: 'The trade ID to get details for',
          },
        },
        required: ['trade_id'],
      },
    },
  },
];

// ============================================================================
// ENTRY GATEKEEPING SYSTEM PROMPT
// ============================================================================

const ATLAS_ENTRY_SYSTEM_PROMPT = `Eres "Atlas Trade Manager" — El supervisor AI de trading que decide si aprobar o bloquear entradas a trades.

## ROL
- Recibes alertas pendientes del Sentinel Agent con tesis de trading
- Decides: APPROVE_ENTRY (ejecutar), WAIT (esperar mejor precio/condiciones), BLOCK (rechazar)
- Verificas condiciones de riesgo globales antes de aprobar
- NO ejecutas órdenes, solo das el veredicto

## REGLAS DE DECISIÓN

### BLOQUEOS AUTOMÁTICOS (→ BLOCK)
1. Kill switch activo
2. Daily drawdown > 75% del límite
3. Más de max_trades_per_day ejecutados
4. Cooldown activo
5. Drift entre venues > drift_block_usd
6. Spread de Alpaca > alpaca_spread_wait_usd

### ESPERAR (→ WAIT)
1. Confidence del alert < 60%
2. Drift entre venues moderado (> $5 pero < block)
3. Spread de Alpaca moderado (> $2 pero < wait threshold)
4. Posición actual > 80% del máximo permitido
5. Daily drawdown > 50% del límite

### APROBAR (→ APPROVE_ENTRY)
1. Confidence >= 60%
2. Sin flags de riesgo activos
3. Precio dentro de entry_zone del alert
4. Suficiente margen para la posición

## OUTPUT (JSON estricto)
{
  "type": "ATLAS_DECISIONS",
  "ts": timestamp_ms,
  "symbol": "string",
  "global_governor": {
    "status": "NORMAL|CAUTION|EMERGENCY",
    "action": "NONE|PAUSE_NEW_ENTRIES|REQUIRE_HUMAN_APPROVAL|CLOSE_ALL",
    "reasons": ["razón 1", "razón 2"]
  },
  "entry_gatekeeping": [
    {
      "candidate_id": "uuid del alert",
      "setup": "LONG|SHORT",
      "decision": "APPROVE_ENTRY|WAIT|BLOCK",
      "why": ["razón 1", "razón 2"],
      "risk_flags": ["flag 1", "flag 2"],
      "execution_hint": {
        "preferred_order_type": "limit|market|stop_limit",
        "entry_logic": "descripción de cómo entrar",
        "stop_logic": "descripción de dónde poner stop",
        "tp_logic": "descripción de take profits",
        "notional_usd_cap": number_or_null,
        "constraints": ["constraint 1"]
      },
      "confidence": {
        "score_0_100": number,
        "missing_data": ["dato faltante 1"]
      }
    }
  ],
  "analysis_log": {
    "cycle_id": "string",
    "cycle_type": "entry",
    "inputs_digest": {
      "hl_mid": number,
      "alpaca_mid": number,
      "drift_usd": number,
      "alpaca_spread": number,
      "flush_score": number,
      "burst_score": number,
      "reclaim_flag": boolean,
      "absorption_score": number,
      "open_trades_count": number,
      "daily_pnl_usd": number,
      "liq_10m_total_usd": number
    },
    "decisions_digest": {
      "entries": { "approved": 0, "wait": 0, "blocked": 0 },
      "trade_actions_total": 0,
      "global_action": "string"
    },
    "notable_events": ["evento 1"],
    "data_quality": {
      "ws_connected": boolean,
      "data_freshness_ms": number,
      "missing_fields": []
    }
  },
  "telemetry": {
    "cooldown_active": boolean,
    "kill_switch_active": boolean,
    "daily_dd_limit_usd": number,
    "daily_pnl_usd": number,
    "latency_ms_est": number
  }
}`;

// ============================================================================
// TRADE MANAGEMENT SYSTEM PROMPT
// ============================================================================

const ATLAS_TRADE_SYSTEM_PROMPT = `Eres "Atlas Trade Manager" — El supervisor AI que gestiona posiciones abiertas y optimiza profit/riesgo.

## ROL
- Revisas trades abiertos cada 10 minutos
- Clasificas cada trade: HOLD, DEFEND, OPTIMIZE, EXIT
- Propones acciones: MODIFY_STOP, MODIFY_TP, CLOSE_PARTIAL, CLOSE_ALL
- Analizas progreso vs tiempo vs tesis original
- NUNCA widening del stop (solo tighten)

## CATEGORÍAS DE TRADE

### HOLD - Trade va bien
- PnL positivo y progresando hacia TP
- Sin señales adversas
- Tiempo dentro de lo esperado
- Acción: Mantener, posible trail stop

### DEFEND - Trade en riesgo
- PnL negativo pero tesis aún válida
- MAE creciendo pero no ha tocado invalidation
- Necesita protección
- Acción: Tighten stop, considerar hedge

### OPTIMIZE - Trade ganador a proteger
- PnL > 50% del target
- MFE significativo
- Acción: Asegurar ganancias, trail stop agresivo, cerrar parcial

### EXIT - Trade a cerrar
- Tesis invalidada
- Time stop alcanzado
- PnL muy negativo sin recuperación
- Acción: Cerrar todo o parcial

## REGLAS DE GESTIÓN

1. **Nunca widening**: El stop solo puede moverse a favor, nunca alejarse del precio
2. **Time stops**: Si age_sec > time_stop_sec y no está en profit, cerrar
3. **Profit protection**: Si PnL > 50% TP, mover stop a breakeven + pequeño buffer
4. **Trailing logic**: Solo trail si PnL > 30% del target
5. **Partial closes**: Cerrar 50% al primer TP, dejar runner con trail

## CONSTRAINTS SIEMPRE VERIFICAR
- max_actions_per_cycle: No exceder este número de acciones en un ciclo
- max_actions_per_trade: No más de N modificaciones por trade
- min_seconds_between_modifications: Respetar cooldown entre modificaciones
- Verificar drift antes de ejecutar (no actuar si drift > guardrails.drift_block_usd)

## OUTPUT (JSON estricto)
{
  "type": "ATLAS_DECISIONS",
  "ts": timestamp_ms,
  "symbol": "string",
  "global_governor": {
    "status": "NORMAL|CAUTION|EMERGENCY",
    "action": "NONE|PAUSE_NEW_ENTRIES|REQUIRE_HUMAN_APPROVAL|CLOSE_ALL",
    "reasons": ["razón 1", "razón 2"]
  },
  "trade_management": [
    {
      "trade_id": "uuid",
      "review": {
        "review_interval_sec": 600,
        "is_due": true,
        "last_review_ts": timestamp_or_null,
        "current_review_ts": timestamp,
        "window_used_sec": 600,
        "progress_assessment": "GOOD|STALLING|BAD",
        "progress_notes": ["nota 1"]
      },
      "category": "HOLD|DEFEND|OPTIMIZE|EXIT",
      "decision": "APPROVE|WAIT|BLOCK",
      "management_thesis": {
        "summary": "resumen corto",
        "market_read": ["observación 1"],
        "invalidation": ["condición de invalidación"]
      },
      "actions": [
        {
          "type": "MODIFY_STOP|MODIFY_TP|CLOSE_PARTIAL|CLOSE_ALL",
          "order_id": "string_or_null",
          "payload": {
            "venue": "ALPACA|HYPERLIQUID",
            "mode": "paper|live",
            "side": "buy|sell|null",
            "order_type": "market|limit|stop_limit|null",
            "new_stop_price": number_or_null,
            "new_tp_price": number_or_null,
            "qty": number_or_null,
            "notional_usd": number_or_null,
            "time_in_force": "gtc|ioc|null",
            "reason": "justificación"
          },
          "constraints_checked": ["constraint verificada"]
        }
      ],
      "profit_optimization_notes": ["nota de optimización"],
      "risk_snapshot": {
        "unrealized_pnl_usd": number,
        "mfe_usd": number,
        "mae_usd": number,
        "age_sec": number,
        "time_stop_sec": number,
        "volatility_state": "high|medium|low",
        "atr_1m": number,
        "chop_risk": "high|medium|low",
        "drift_usd": number,
        "alpaca_spread": number,
        "liq_10m_total_usd": number,
        "liq_10m_is_proxy": boolean
      },
      "confidence": {
        "score_0_100": number,
        "evidence": ["evidencia 1"],
        "missing_data": []
      }
    }
  ],
  "analysis_log": {
    "cycle_id": "string",
    "cycle_type": "trade",
    "inputs_digest": {...},
    "decisions_digest": {
      "entries": { "approved": 0, "wait": 0, "blocked": 0 },
      "trade_actions_total": number,
      "global_action": "string"
    },
    "notable_events": ["evento 1"],
    "data_quality": {...}
  },
  "improvement_plan": {
    "for_alert_agent": [
      {
        "issue": "problema detectado",
        "proposal": "propuesta de mejora",
        "expected_impact": "impacto esperado",
        "evidence": ["evidencia 1"]
      }
    ],
    "for_atlas_trade_manager": [...],
    "for_deterministic_risk_engine": [...],
    "priority": "P0|P1|P2"
  },
  "telemetry": {
    "cooldown_active": boolean,
    "kill_switch_active": boolean,
    "daily_dd_limit_usd": number,
    "daily_pnl_usd": number,
    "latency_ms_est": number
  }
}`;

// ============================================================================
// ATLAS AGENT CLASS
// ============================================================================

export class AtlasAgent {
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

  // ==========================================================================
  // ENTRY GATEKEEPING (5 min interval)
  // ==========================================================================

  /**
   * Analyze pending alerts and decide whether to approve entry
   */
  async analyzeEntries(
    request: AtlasEntryRequest,
    context: AgentContext
  ): Promise<{ response: AtlasEntryResponse; trace: AgentTrace }> {
    const startTime = Date.now();
    const { bundle } = request;
    const cycleId = `entry-${Date.now()}`;

    // Build user prompt with bundle data
    const userPrompt = this.buildEntryPrompt(bundle, cycleId);
    console.log('[AtlasAgent Entry] Building prompt, candidates:', bundle.alert_candidates.length);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: ATLAS_ENTRY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    // Initial completion - NO tools to speed up (bundle already has all data)
    console.log('[AtlasAgent Entry] Calling OpenAI (model:', this.model, ')...');
    let completion = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: ATLAS_TEMPERATURE,
      response_format: { type: 'json_object' },
    });
    console.log('[AtlasAgent Entry] Initial completion received');

    // Skip tool calling for now - the bundle already contains all needed data
    // This speeds up the response significantly
    const toolCallsProcessed = 0;

    // Force final JSON response if needed
    if (!completion.choices[0]?.message?.content) {
      console.log('[AtlasAgent Entry] No content, requesting JSON...');
      messages.push(completion.choices[0]?.message || { role: 'assistant', content: '' });
      messages.push({
        role: 'user',
        content: 'Provide your final entry gatekeeping analysis as JSON.',
      });

      completion = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: ATLAS_TEMPERATURE,
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
      rawResponse = { type: 'NEED_MORE_DATA' };
    }

    // Build typed response
    const response = this.buildEntryResponse(rawResponse, bundle, cycleId);

    // Build trace
    const trace: AgentTrace = {
      agentName: 'atlas-entry',
      input: {
        candidates_count: bundle.alert_candidates.length,
        portfolio_equity: bundle.portfolio_state.equity_usd,
        strategy_id: request.strategy_id,
      },
      output: response,
      tokensInput,
      tokensOutput,
      latencyMs,
      model: this.model,
      costUsd: this.calculateCost(tokensInput, tokensOutput),
    };

    return { response, trace };
  }

  // ==========================================================================
  // TRADE MANAGEMENT (10 min interval)
  // ==========================================================================

  /**
   * Review open trades and propose management actions
   */
  async manageTrades(
    request: AtlasTradeRequest,
    context: AgentContext
  ): Promise<{ response: AtlasTradeResponse; trace: AgentTrace }> {
    const startTime = Date.now();
    const { bundle } = request;
    const cycleId = `trade-${Date.now()}`;

    // Build user prompt with bundle data
    const userPrompt = this.buildTradePrompt(bundle, cycleId);
    console.log('[AtlasAgent Trades] Building prompt, trades:', bundle.open_trades.length);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: ATLAS_TRADE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    // Initial completion - NO tools to speed up (bundle already has all data)
    console.log('[AtlasAgent Trades] Calling OpenAI (model:', this.model, ')...');
    let completion = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: ATLAS_TEMPERATURE,
      response_format: { type: 'json_object' },
    });
    console.log('[AtlasAgent Trades] Initial completion received');

    // Skip tool calling - the bundle already contains all needed data
    // This speeds up the response significantly

    // Force final JSON response if needed
    if (!completion.choices[0]?.message?.content) {
      console.log('[AtlasAgent Trades] No content, requesting JSON...');
      messages.push(completion.choices[0]?.message || { role: 'assistant', content: '' });
      messages.push({
        role: 'user',
        content: 'Provide your final trade management analysis as JSON.',
      });

      completion = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: ATLAS_TEMPERATURE,
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
      rawResponse = { type: 'NEED_MORE_DATA' };
    }

    // Build typed response
    const response = this.buildTradeResponse(rawResponse, bundle, cycleId);

    // Build trace
    const trace: AgentTrace = {
      agentName: 'atlas-trades',
      input: {
        open_trades_count: bundle.open_trades.length,
        portfolio_equity: bundle.portfolio_state.equity_usd,
        strategy_id: request.strategy_id,
      },
      output: response,
      tokensInput,
      tokensOutput,
      latencyMs,
      model: this.model,
      costUsd: this.calculateCost(tokensInput, tokensOutput),
    };

    return { response, trace };
  }

  // ==========================================================================
  // PROMPT BUILDERS
  // ==========================================================================

  private buildEntryPrompt(bundle: AtlasEntryBundle, cycleId: string): string {
    const candidates = bundle.alert_candidates
      .map((c, i) => `
### Candidato ${i + 1}: ${c.symbol} ${c.setup}
- ID: ${c.candidate_id}
- Pattern: ${c.pattern_type}
- Confidence: ${(c.confidence * 100).toFixed(0)}%
- Entry Zone: $${c.entry_zone.min.toLocaleString()} - $${c.entry_zone.max.toLocaleString()} (ideal: $${c.entry_zone.ideal.toLocaleString()})
- Stop Loss: $${c.stop_loss.toLocaleString()}
- Take Profit: $${c.take_profit.toLocaleString()}
- Thesis: ${c.thesis_summary}
- Risk Notes: ${c.risk_notes.join(', ') || 'Ninguna'}
`)
      .join('\n');

    return `Analiza estas alertas pendientes y decide si aprobar, esperar o bloquear cada entrada.

## Cycle ID: ${cycleId}
## Timestamp: ${new Date(bundle.now).toISOString()}

## Estado del Mercado
- HL Mid: $${bundle.market_realtime.hl_mid.toLocaleString()}
- HL Bid/Ask: $${bundle.market_realtime.hl_bid.toLocaleString()} / $${bundle.market_realtime.hl_ask.toLocaleString()}
- Alpaca Mid: ${bundle.market_realtime.alpaca_mid ? '$' + bundle.market_realtime.alpaca_mid.toLocaleString() : 'N/A'}
- Drift USD: $${bundle.market_realtime.drift_usd.toFixed(2)}
- Alpaca Spread: ${bundle.market_realtime.alpaca_spread_usd ? '$' + bundle.market_realtime.alpaca_spread_usd.toFixed(2) : 'N/A'}
- Funding Rate: ${(bundle.market_realtime.funding_rate * 100).toFixed(4)}%
- Open Interest: $${bundle.market_realtime.open_interest.toLocaleString()}

## Indicadores Internos
- Flush Score: ${bundle.indicators_internal.flush_score}
- Burst Score: ${bundle.indicators_internal.burst_score}
- Reclaim Flag: ${bundle.indicators_internal.reclaim_flag}
- Absorption Score: ${bundle.indicators_internal.absorption_score}
- Whale Net Flow: $${bundle.indicators_internal.whale_net_flow_usd.toLocaleString()} (${bundle.indicators_internal.whale_dominant_direction})
- Soportes: ${bundle.indicators_internal.support_levels.map(l => '$' + l.toLocaleString()).join(', ') || 'N/A'}
- Resistencias: ${bundle.indicators_internal.resistance_levels.map(l => '$' + l.toLocaleString()).join(', ') || 'N/A'}
- ATR 1m: ${bundle.indicators_internal.atr_1m || 'N/A'}
- ATR 5m: ${bundle.indicators_internal.atr_5m || 'N/A'}
- Chop Index: ${bundle.indicators_internal.chop_index || 'N/A'}
- Data Freshness: ${bundle.indicators_internal.data_freshness_ms}ms
- WS Connected: ${bundle.indicators_internal.ws_connected}

## Estado del Portfolio
- Equity: $${bundle.portfolio_state.equity_usd.toLocaleString()}
- Daily P&L: $${bundle.portfolio_state.daily_pnl_usd.toFixed(2)}
- Daily DD Limit: $${bundle.portfolio_state.daily_dd_limit_usd.toFixed(2)}
- Trades Hoy: ${bundle.portfolio_state.daily_trades_count} / ${bundle.portfolio_state.max_trades_per_day}
- Cooldown: ${bundle.portfolio_state.cooldown_active ? 'ACTIVO hasta ' + bundle.portfolio_state.cooldown_until : 'No'}
- Kill Switch: ${bundle.portfolio_state.kill_switch_active ? 'ACTIVO - ' + bundle.portfolio_state.kill_switch_reason : 'No'}
- Posición Actual: $${bundle.portfolio_state.current_position_value.toFixed(2)} / $${bundle.portfolio_state.max_position_value.toFixed(2)}

## Guardrails
- Drift Block: $${bundle.guardrails.drift_block_usd}
- Alpaca Spread Wait: $${bundle.guardrails.alpaca_spread_wait_usd}
- Max Actions/Cycle: ${bundle.guardrails.max_actions_per_cycle}
- Never Widen Stop: ${bundle.guardrails.never_widen_stop}

## Alertas Candidatas (${bundle.alert_candidates.length})
${candidates || 'Ninguna alerta pendiente'}

Responde con tu análisis en formato JSON.`;
  }

  private buildTradePrompt(bundle: AtlasTradeBundle, cycleId: string): string {
    const trades = bundle.open_trades
      .map((t, i) => `
### Trade ${i + 1}: ${t.symbol} ${t.side}
- ID: ${t.trade_id}
- Alert ID: ${t.alert_id || 'N/A'}
- Entry: $${t.entry_price.toLocaleString()} @ ${t.entry_time}
- Size: $${t.size_usd.toLocaleString()}
- Current Price: $${t.current_price.toLocaleString()}
- Unrealized P&L: $${t.unrealized_pnl_usd.toFixed(2)} (${t.unrealized_pnl_pct.toFixed(2)}%)
- MFE: $${t.mfe_usd.toFixed(2)}
- MAE: $${t.mae_usd.toFixed(2)}
- Age: ${Math.floor(t.age_sec / 60)}m ${t.age_sec % 60}s
- Reviews: ${t.review_count}
- Last Review: ${t.last_review_ts ? new Date(t.last_review_ts).toISOString() : 'Never'}
- Pattern: ${t.pattern_type || 'N/A'}
- Thesis: ${t.thesis_title || 'N/A'}
- Risk Plan:
  - Original SL: $${t.risk_plan.original_stop_loss.toLocaleString()}
  - Current SL: $${t.risk_plan.current_stop_loss.toLocaleString()}
  - Original TP: $${t.risk_plan.original_take_profit.toLocaleString()}
  - Current TP: $${t.risk_plan.current_take_profit.toLocaleString()}
  - Time Stop: ${t.risk_plan.time_stop_sec ? t.risk_plan.time_stop_sec + 's' : 'N/A'}
  - Invalidation: $${t.risk_plan.invalidation_level.toLocaleString()}
  - R-Multiple Target: ${t.risk_plan.r_multiple_target}
`)
      .join('\n');

    const orders = bundle.orders_state
      .map((o) => `- ${o.type.toUpperCase()} @ $${o.price} (${o.status}) [${o.order_id.slice(0, 8)}...]`)
      .join('\n');

    return `Revisa los trades abiertos y decide acciones de gestión.

## Cycle ID: ${cycleId}
## Timestamp: ${new Date(bundle.now).toISOString()}

## Estado del Mercado
- HL Mid: $${bundle.market_realtime.hl_mid.toLocaleString()}
- Drift USD: $${bundle.market_realtime.drift_usd.toFixed(2)}
- Alpaca Spread: ${bundle.market_realtime.alpaca_spread_usd ? '$' + bundle.market_realtime.alpaca_spread_usd.toFixed(2) : 'N/A'}
- Funding Rate: ${(bundle.market_realtime.funding_rate * 100).toFixed(4)}%
- Open Interest: $${bundle.market_realtime.open_interest.toLocaleString()}

## Indicadores Internos
- Flush Score: ${bundle.indicators_internal.flush_score}
- Burst Score: ${bundle.indicators_internal.burst_score}
- Reclaim Flag: ${bundle.indicators_internal.reclaim_flag}
- Absorption Score: ${bundle.indicators_internal.absorption_score}
- Whale Net Flow: $${bundle.indicators_internal.whale_net_flow_usd.toLocaleString()} (${bundle.indicators_internal.whale_dominant_direction})
- ATR 1m: ${bundle.indicators_internal.atr_1m || 'N/A'}
- Chop Index: ${bundle.indicators_internal.chop_index || 'N/A'}

## Estado del Portfolio
- Equity: $${bundle.portfolio_state.equity_usd.toLocaleString()}
- Daily P&L: $${bundle.portfolio_state.daily_pnl_usd.toFixed(2)}
- Daily DD Limit: $${bundle.portfolio_state.daily_dd_limit_usd.toFixed(2)}
- Kill Switch: ${bundle.portfolio_state.kill_switch_active ? 'ACTIVO - ' + bundle.portfolio_state.kill_switch_reason : 'No'}

## Liquidations (últimos intervalos)
- 10m: Total $${bundle.liquidation_metrics.last_10m.total_usd?.toLocaleString() || 'N/A'} (L: $${bundle.liquidation_metrics.last_10m.longs_usd?.toLocaleString() || 'N/A'} / S: $${bundle.liquidation_metrics.last_10m.shorts_usd?.toLocaleString() || 'N/A'})
- 1h: Total $${bundle.liquidation_metrics.last_1h.total_usd?.toLocaleString() || 'N/A'}
- 4h: Total $${bundle.liquidation_metrics.last_4h.total_usd?.toLocaleString() || 'N/A'}
- Source: ${bundle.liquidation_metrics.source}

## Time Windows Config
- Review Interval: ${bundle.time_windows.review_interval_sec}s
- Hard Time Stop Default: ${bundle.time_windows.hard_time_stop_default_sec}s
- Max Expected Age: ${bundle.time_windows.max_expected_trade_age_sec}s

## Guardrails
- Drift Block: $${bundle.guardrails.drift_block_usd}
- Max Actions/Cycle: ${bundle.guardrails.max_actions_per_cycle}
- Max Actions/Trade: ${bundle.guardrails.max_actions_per_trade}
- Min Seconds Between Mods: ${bundle.guardrails.min_seconds_between_modifications}
- Never Widen Stop: ${bundle.guardrails.never_widen_stop}

## Órdenes Activas
${orders || 'Ninguna'}

## Trades Abiertos (${bundle.open_trades.length})
${trades || 'Ningún trade abierto'}

Responde con tu análisis en formato JSON.`;
  }

  // ==========================================================================
  // RESPONSE BUILDERS
  // ==========================================================================

  private buildEntryResponse(
    raw: Record<string, unknown>,
    bundle: AtlasEntryBundle,
    cycleId: string
  ): AtlasEntryResponse {
    const now = Date.now();

    // Build global governor with risk overrides
    const globalGovernor = this.buildGlobalGovernor(raw, bundle.portfolio_state);

    // Build entry gatekeeping from raw
    const entryGatekeeping: EntryGatekeeping[] = Array.isArray(raw.entry_gatekeeping)
      ? (raw.entry_gatekeeping as EntryGatekeeping[])
      : [];

    // Build analysis log
    const analysisLog: AnalysisLog = {
      cycle_id: cycleId,
      cycle_type: 'entry',
      inputs_digest: {
        hl_mid: bundle.market_realtime.hl_mid,
        alpaca_mid: bundle.market_realtime.alpaca_mid,
        drift_usd: bundle.market_realtime.drift_usd,
        alpaca_spread: bundle.market_realtime.alpaca_spread_usd,
        flush_score: bundle.indicators_internal.flush_score,
        burst_score: bundle.indicators_internal.burst_score,
        reclaim_flag: bundle.indicators_internal.reclaim_flag,
        absorption_score: bundle.indicators_internal.absorption_score,
        open_trades_count: 0, // No open trades in entry bundle
        daily_pnl_usd: bundle.portfolio_state.daily_pnl_usd,
        liq_10m_total_usd: null,
      },
      decisions_digest: {
        entries: {
          approved: entryGatekeeping.filter(e => e.decision === 'APPROVE_ENTRY').length,
          wait: entryGatekeeping.filter(e => e.decision === 'WAIT').length,
          blocked: entryGatekeeping.filter(e => e.decision === 'BLOCK').length,
        },
        trade_actions_total: 0,
        global_action: globalGovernor.action,
      },
      notable_events: Array.isArray(raw.notable_events) ? raw.notable_events as string[] : [],
      data_quality: {
        ws_connected: bundle.indicators_internal.ws_connected,
        data_freshness_ms: bundle.indicators_internal.data_freshness_ms,
        missing_fields: [],
      },
    };

    // Build telemetry
    const telemetry: AtlasTelemetry = {
      cooldown_active: bundle.portfolio_state.cooldown_active,
      kill_switch_active: bundle.portfolio_state.kill_switch_active,
      daily_dd_limit_usd: bundle.portfolio_state.daily_dd_limit_usd,
      daily_pnl_usd: bundle.portfolio_state.daily_pnl_usd,
      latency_ms_est: null,
    };

    return {
      type: (raw.type as 'ATLAS_DECISIONS' | 'NEED_MORE_DATA') || 'ATLAS_DECISIONS',
      ts: now,
      symbol: bundle.alert_candidates[0]?.symbol || 'UNKNOWN',
      global_governor: globalGovernor,
      entry_gatekeeping: entryGatekeeping,
      analysis_log: analysisLog,
      telemetry,
    };
  }

  private buildTradeResponse(
    raw: Record<string, unknown>,
    bundle: AtlasTradeBundle,
    cycleId: string
  ): AtlasTradeResponse {
    const now = Date.now();

    // Build global governor with risk overrides
    const globalGovernor = this.buildGlobalGovernor(raw, bundle.portfolio_state);

    // Build trade management from raw
    const tradeManagement: TradeManagement[] = Array.isArray(raw.trade_management)
      ? (raw.trade_management as TradeManagement[])
      : [];

    // Count total actions
    const totalActions = tradeManagement.reduce(
      (sum, tm) => sum + (tm.actions?.length || 0),
      0
    );

    // Build analysis log
    const analysisLog: AnalysisLog = {
      cycle_id: cycleId,
      cycle_type: 'trade',
      inputs_digest: {
        hl_mid: bundle.market_realtime.hl_mid,
        alpaca_mid: bundle.market_realtime.alpaca_mid,
        drift_usd: bundle.market_realtime.drift_usd,
        alpaca_spread: bundle.market_realtime.alpaca_spread_usd,
        flush_score: bundle.indicators_internal.flush_score,
        burst_score: bundle.indicators_internal.burst_score,
        reclaim_flag: bundle.indicators_internal.reclaim_flag,
        absorption_score: bundle.indicators_internal.absorption_score,
        open_trades_count: bundle.open_trades.length,
        daily_pnl_usd: bundle.portfolio_state.daily_pnl_usd,
        liq_10m_total_usd: bundle.liquidation_metrics.last_10m.total_usd,
      },
      decisions_digest: {
        entries: { approved: 0, wait: 0, blocked: 0 },
        trade_actions_total: totalActions,
        global_action: globalGovernor.action,
      },
      notable_events: Array.isArray(raw.notable_events) ? raw.notable_events as string[] : [],
      data_quality: {
        ws_connected: bundle.indicators_internal.ws_connected,
        data_freshness_ms: bundle.indicators_internal.data_freshness_ms,
        missing_fields: [],
      },
    };

    // Build improvement plan from raw or default
    const improvementPlan: ImprovementPlan = (raw.improvement_plan as ImprovementPlan) || {
      for_alert_agent: [],
      for_atlas_trade_manager: [],
      for_deterministic_risk_engine: [],
      priority: 'P2',
    };

    // Build telemetry
    const telemetry: AtlasTelemetry = {
      cooldown_active: bundle.portfolio_state.cooldown_active,
      kill_switch_active: bundle.portfolio_state.kill_switch_active,
      daily_dd_limit_usd: bundle.portfolio_state.daily_dd_limit_usd,
      daily_pnl_usd: bundle.portfolio_state.daily_pnl_usd,
      latency_ms_est: null,
    };

    return {
      type: (raw.type as 'ATLAS_DECISIONS' | 'NEED_MORE_DATA') || 'ATLAS_DECISIONS',
      ts: now,
      symbol: bundle.open_trades[0]?.symbol || 'UNKNOWN',
      global_governor: globalGovernor,
      trade_management: tradeManagement,
      analysis_log: analysisLog,
      improvement_plan: improvementPlan,
      telemetry,
    };
  }

  private buildGlobalGovernor(
    raw: Record<string, unknown>,
    portfolioState: AtlasEntryBundle['portfolio_state']
  ): GlobalGovernor {
    const rawGovernor = raw.global_governor as GlobalGovernor | undefined;
    const reasons: string[] = rawGovernor?.reasons || [];

    // Override based on portfolio state
    if (portfolioState.kill_switch_active) {
      return {
        status: 'EMERGENCY',
        action: 'CLOSE_ALL',
        reasons: [...reasons, `Kill switch activo: ${portfolioState.kill_switch_reason}`],
      };
    }

    const dailyDdRatio = Math.abs(portfolioState.daily_pnl_usd) / portfolioState.daily_dd_limit_usd;

    if (dailyDdRatio > 0.75) {
      return {
        status: 'EMERGENCY',
        action: 'PAUSE_NEW_ENTRIES',
        reasons: [...reasons, `Daily DD al ${(dailyDdRatio * 100).toFixed(0)}% del límite`],
      };
    }

    if (portfolioState.cooldown_active) {
      return {
        status: 'CAUTION',
        action: 'PAUSE_NEW_ENTRIES',
        reasons: [...reasons, `Cooldown activo hasta ${portfolioState.cooldown_until}`],
      };
    }

    if (dailyDdRatio > 0.5) {
      return {
        status: 'CAUTION',
        action: 'REQUIRE_HUMAN_APPROVAL',
        reasons: [...reasons, `Daily DD al ${(dailyDdRatio * 100).toFixed(0)}% del límite`],
      };
    }

    return rawGovernor || {
      status: 'NORMAL',
      action: 'NONE',
      reasons: [],
    };
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private calculateCost(input: number, output: number): number {
    return (input * COST_PER_1K_INPUT + output * COST_PER_1K_OUTPUT) / 1000;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create Atlas agent from environment variables
 */
export function createAtlasAgent(
  config?: Partial<AgentConfig>,
  toolHandlers?: ToolHandlers
): AtlasAgent {
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }

  return new AtlasAgent(
    {
      apiKey,
      model: config?.model,
      maxTokens: config?.maxTokens,
    },
    toolHandlers
  );
}

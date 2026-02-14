/**
 * AI Agents API
 * OpenAI agent interactions for trading
 */

// Vercel Serverless Function Configuration
// OpenAI agent calls typically take 5-30 seconds
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { createTradingAgents, createSentinelAgent, createAtlasAgent, type ToolHandlers } from '@kit/integrations/openai';
import { createHyperliquidInfo } from '@kit/integrations/hyperliquid';
import type {
  ExplanationRequest,
  SupervisionRequest,
  ReportRequest,
  OptimizationRequest,
  AgentContext,
} from '@kit/integrations/openai';
import type { Json } from '@kit/supabase/database';
import type {
  RealtimeBundle,
  RealtimeBundleV2,
  SentinelRequest,
  SentinelResponse,
  SentinelResponseV2,
  SentinelAlertV2,
  AlertType,
  AtlasEntryRequest,
  AtlasEntryBundle,
  AtlasTradeRequest,
  AtlasTradeBundle,
  AtlasEntryResponse,
  AtlasTradeResponse,
} from '@kit/trading-core';

// ============================================================================
// SENTINEL AGENT CONFIGURATION
// ============================================================================

const SENTINEL_CONFIG = {
  // V1: Minimum confidence threshold (0.80 = 80%)
  MIN_CONFIDENCE: 0.80,
  // V1: Cooldown between alerts for same symbol (5 minutes)
  COOLDOWN_MS: 5 * 60 * 1000,
  // Minimum Risk/Reward ratio
  MIN_RISK_REWARD: 1.5,
  // Minimum stop loss distance from entry (1%)
  MIN_STOP_LOSS_PCT: 1.0,
  // Block conflicting positions (opposite direction)
  BLOCK_CONFLICTING_POSITIONS: true,
};

// ============================================================================
// SENTINEL V2 CONFIGURATION
// ============================================================================

const SENTINEL_V2_CONFIG = {
  // Window size for cooldown (10 minutes)
  WINDOW_SIZE_MS: 10 * 60 * 1000,
  // Max RISK_ALERT per window per symbol
  MAX_RISK_ALERTS_PER_WINDOW: 2,
  // Max TRADE_ALERT per window per symbol
  MAX_TRADE_ALERTS_PER_WINDOW: 1,
  // Allow updating existing alert in same window
  ALLOW_UPDATE_IN_WINDOW: true,
  // Minimum risk_confidence for RISK_ALERT (0.70 = 70%)
  MIN_RISK_CONFIDENCE: 0.70,
  // Minimum setup_confidence for TRADE_ALERT (0.80 = 80%)
  MIN_SETUP_CONFIDENCE: 0.80,
  // Minimum confirmations for TRADE_ALERT
  MIN_CONFIRMATIONS: 2,
};

/**
 * Get the start timestamp of the current 10-minute window
 */
function getWindowStart(timestamp: number): number {
  return Math.floor(timestamp / SENTINEL_V2_CONFIG.WINDOW_SIZE_MS)
         * SENTINEL_V2_CONFIG.WINDOW_SIZE_MS;
}

/**
 * Check if we can emit an alert or should update an existing one (V2)
 */
async function checkAlertWindowV2(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  symbol: string,
  alertType: AlertType
): Promise<{ canEmit: boolean; updateAlertId?: string; reason?: string }> {
  const windowStart = getWindowStart(Date.now());
  const maxAlerts = alertType === 'RISK_ALERT'
    ? SENTINEL_V2_CONFIG.MAX_RISK_ALERTS_PER_WINDOW
    : SENTINEL_V2_CONFIG.MAX_TRADE_ALERTS_PER_WINDOW;

  const { data: existingAlerts } = await client
    .from('agent_alerts')
    .select('id, alert_type, created_at')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .eq('alert_type', alertType)
    .gte('created_at', new Date(windowStart).toISOString())
    .order('created_at', { ascending: false })
    .limit(maxAlerts);

  if (!existingAlerts || existingAlerts.length < maxAlerts) {
    return { canEmit: true };
  }

  // Already at max alerts for this window
  if (SENTINEL_V2_CONFIG.ALLOW_UPDATE_IN_WINDOW && existingAlerts.length > 0) {
    // Return the most recent alert ID for update
    return {
      canEmit: false,
      updateAlertId: existingAlerts[0].id,
      reason: `Max ${alertType} alerts reached for this 10m window, updating existing`,
    };
  }

  return {
    canEmit: false,
    reason: `Max ${alertType} alerts (${maxAlerts}) reached for this 10m window`,
  };
}

/**
 * Count confirmations in a pattern
 */
function countConfirmations(pattern: unknown): number {
  if (!pattern || typeof pattern !== 'object') return 0;
  const p = pattern as { confirmations?: Record<string, boolean> };
  if (!p.confirmations) return 0;
  return Object.values(p.confirmations).filter(Boolean).length;
}

// ============================================================================
// SENTINEL VALIDATION FUNCTIONS
// ============================================================================

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Check if there's a recent alert for the same symbol (cooldown)
 */
async function checkAlertCooldown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  symbol: string
): Promise<ValidationResult> {
  const cooldownStart = new Date(Date.now() - SENTINEL_CONFIG.COOLDOWN_MS).toISOString();

  const { data: recentAlerts } = await client
    .from('agent_alerts')
    .select('id, created_at, setup')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .eq('decision', 'ALERT')
    .gte('created_at', cooldownStart)
    .limit(1);

  if (recentAlerts && recentAlerts.length > 0) {
    const lastAlert = recentAlerts[0] as { id: string; created_at: string; setup: string };
    const timeSince = Date.now() - new Date(lastAlert.created_at).getTime();
    const remainingCooldown = Math.ceil((SENTINEL_CONFIG.COOLDOWN_MS - timeSince) / 1000);

    return {
      isValid: false,
      reason: `Cooldown active: ${remainingCooldown}s remaining since last ${symbol} alert`,
    };
  }

  return { isValid: true };
}

/**
 * Check if there are open Binance orders in conflicting direction
 */
async function checkConflictingPositions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  symbol: string,
  proposedSetup: 'LONG' | 'SHORT'
): Promise<ValidationResult> {
  if (!SENTINEL_CONFIG.BLOCK_CONFLICTING_POSITIONS) {
    return { isValid: true };
  }

  // Check real Binance orders via strategy ownership
  const { data: strategies } = await client
    .from('strategies')
    .select('id')
    .eq('user_id', userId)
    .eq('symbol', `${symbol}USDT`);

  if (!strategies || strategies.length === 0) {
    return { isValid: true };
  }

  const strategyIds = strategies.map((s: { id: string }) => s.id);

  const { data: openOrders } = await client
    .from('orders')
    .select('id, side')
    .eq('broker', 'binance')
    .in('strategy_id', strategyIds)
    .in('status', ['submitted', 'partially_filled']);

  if (openOrders && openOrders.length > 0) {
    const orders = openOrders as Array<{ id: string; side: string }>;
    const oppositeSide = proposedSetup === 'LONG' ? 'SELL' : 'BUY';
    const hasConflicting = orders.some(
      (order) => order.side.toUpperCase() === oppositeSide
    );

    if (hasConflicting) {
      const conflictingSide = proposedSetup === 'LONG' ? 'SHORT' : 'LONG';
      return {
        isValid: false,
        reason: `Conflicting position: Open ${conflictingSide} orders exist for ${symbol}`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate confidence threshold
 */
function validateConfidence(confidence: number): ValidationResult {
  if (confidence < SENTINEL_CONFIG.MIN_CONFIDENCE) {
    return {
      isValid: false,
      reason: `Confidence ${(confidence * 100).toFixed(0)}% below threshold ${(SENTINEL_CONFIG.MIN_CONFIDENCE * 100).toFixed(0)}%`,
    };
  }
  return { isValid: true };
}

/**
 * Validate Risk/Reward ratio and stop loss placement
 */
function validateRiskReward(
  response: SentinelResponse,
  currentPrice: number
): ValidationResult {
  const exec = response.execution_candidate;
  if (!exec) {
    return { isValid: true }; // No execution candidate, can't validate
  }

  const entryPrice = exec.entry_zone?.ideal ||
    (exec.entry_zone?.min && exec.entry_zone?.max
      ? (exec.entry_zone.min + exec.entry_zone.max) / 2
      : currentPrice);

  const stopLossPrice = typeof exec.stop_loss === 'object'
    ? exec.stop_loss.price
    : exec.stop_loss;

  const takeProfitPrice = exec.take_profit ||
    (exec.take_profit_targets?.[0]?.price);

  if (!stopLossPrice || !takeProfitPrice) {
    return { isValid: true }; // Missing data, can't validate
  }

  const setup = response.pattern?.setup;
  const isLong = setup === 'LONG_SETUP';

  // Calculate risk and reward
  let riskPct: number;
  let rewardPct: number;

  if (isLong) {
    riskPct = Math.abs((entryPrice - stopLossPrice) / entryPrice) * 100;
    rewardPct = Math.abs((takeProfitPrice - entryPrice) / entryPrice) * 100;
  } else {
    riskPct = Math.abs((stopLossPrice - entryPrice) / entryPrice) * 100;
    rewardPct = Math.abs((entryPrice - takeProfitPrice) / entryPrice) * 100;
  }

  // Check minimum stop loss distance
  if (riskPct < SENTINEL_CONFIG.MIN_STOP_LOSS_PCT) {
    return {
      isValid: false,
      reason: `Stop loss too tight: ${riskPct.toFixed(2)}% (min: ${SENTINEL_CONFIG.MIN_STOP_LOSS_PCT}%)`,
    };
  }

  // Check R:R ratio
  const riskRewardRatio = rewardPct / riskPct;
  if (riskRewardRatio < SENTINEL_CONFIG.MIN_RISK_REWARD) {
    return {
      isValid: false,
      reason: `R:R ratio ${riskRewardRatio.toFixed(2)} below minimum ${SENTINEL_CONFIG.MIN_RISK_REWARD}`,
    };
  }

  return { isValid: true };
}

/**
 * Run all validations on the sentinel response
 */
async function validateSentinelAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  symbol: string,
  currentPrice: number,
  response: SentinelResponse
): Promise<ValidationResult> {
  // Only validate if decision is ALERT
  if (response.decision !== 'ALERT') {
    return { isValid: true };
  }

  const setup = response.pattern?.setup === 'LONG_SETUP' ? 'LONG' : 'SHORT';

  // 1. Check confidence threshold
  const confidenceCheck = validateConfidence(response.confidence);
  if (!confidenceCheck.isValid) {
    console.log('[Sentinel Validation] ❌ Confidence check failed:', confidenceCheck.reason);
    return confidenceCheck;
  }

  // 2. Check cooldown
  const cooldownCheck = await checkAlertCooldown(client, userId, symbol);
  if (!cooldownCheck.isValid) {
    console.log('[Sentinel Validation] ❌ Cooldown check failed:', cooldownCheck.reason);
    return cooldownCheck;
  }

  // 3. Check conflicting positions
  const conflictCheck = await checkConflictingPositions(client, userId, symbol, setup);
  if (!conflictCheck.isValid) {
    console.log('[Sentinel Validation] ❌ Conflict check failed:', conflictCheck.reason);
    return conflictCheck;
  }

  // 4. Check R:R and stop loss
  const rrCheck = validateRiskReward(response, currentPrice);
  if (!rrCheck.isValid) {
    console.log('[Sentinel Validation] ❌ R:R check failed:', rrCheck.reason);
    return rrCheck;
  }

  console.log('[Sentinel Validation] ✅ All checks passed');
  return { isValid: true };
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Agents API] POST request received');

    const client = getSupabaseServerClient();
    const { data: { user }, error: authError } = await client.auth.getUser();

    console.log('[Agents API] Auth result:', {
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message
    });

    if (!user) {
      console.log('[Agents API] Unauthorized - no user found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, data, context: userContext } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }

    const agents = createTradingAgents();

    const context: AgentContext = {
      userId: user.id,
      strategyId: userContext?.strategyId,
      signalId: userContext?.signalId,
      intentId: userContext?.intentId,
      positionId: userContext?.positionId,
    };

    let result;

    switch (action) {
      case 'explain': {
        const explainRequest: ExplanationRequest = {
          type: data.type || 'signal',
          entityId: data.entityId,
          context: data.context || '',
          data: data.data || {},
        };
        result = await agents.explain(explainRequest, context);
        break;
      }

      case 'supervise': {
        const superviseRequest: SupervisionRequest = {
          strategyId: data.strategyId,
          action: data.action || 'review',
          currentState: data.currentState || 'unknown',
          context: data.context || {},
        };
        result = await agents.supervise(superviseRequest, context);
        break;
      }

      case 'report': {
        const reportRequest: ReportRequest = {
          userId: user.id,
          reportType: data.reportType || 'daily',
          startDate: data.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: data.endDate || new Date().toISOString(),
          metrics: data.metrics || {},
          trades: data.trades || [],
        };
        result = await agents.generateReport(reportRequest, context);
        break;
      }

      case 'optimize': {
        const optimizeRequest: OptimizationRequest = {
          strategyId: data.strategyId,
          currentConfig: data.currentConfig || {},
          performanceMetrics: data.performanceMetrics || {},
          recentTrades: data.recentTrades || [],
          goal: data.goal || 'performance',
        };
        result = await agents.optimize(optimizeRequest, context);
        break;
      }

      case 'sentinel': {
        // Create tool handlers for sentinel agent
        const toolHandlers: ToolHandlers = new Map();

        toolHandlers.set('get_market_data', async (args) => {
          try {
            const info = createHyperliquidInfo();
            const allData = await info.getParsedAssetCtxs();
            return allData.find((d) => d.coin === args.symbol) || { error: 'Symbol not found' };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to fetch market data' };
          }
        });

        toolHandlers.set('get_whale_events', async (args) => {
          const minutesBack = typeof args.minutes_back === 'number' ? args.minutes_back : 30;
          const symbolStr = typeof args.symbol === 'string' ? args.symbol : '';
          const { data: whaleEvents } = await client
            .from('whale_events')
            .select('*')
            .eq('symbol', symbolStr)
            .gte('ts', new Date(Date.now() - minutesBack * 60000).toISOString())
            .order('ts', { ascending: false })
            .limit(20);
          return whaleEvents || [];
        });

        toolHandlers.set('get_risk_state', async () => {
          const today = new Date().toISOString().split('T')[0]!;
          const { data: riskState } = await client
            .from('risk_bumpers_state')
            .select('*')
            .eq('user_id', user.id)
            .eq('trading_day', today)
            .single();
          return riskState || {
            daily_loss_usd: 0,
            daily_trades_count: 0,
            cooldown_active: false,
            kill_switch_active: false,
          };
        });

        toolHandlers.set('get_price_levels', async (args) => {
          try {
            const info = createHyperliquidInfo();
            const now = Date.now();
            const symbolStr = typeof args.symbol === 'string' ? args.symbol : 'BTC';
            const candles = await info.getCandles(
              symbolStr,
              '1h',
              now - 24 * 60 * 60 * 1000,
              now
            );
            const highs = candles.map((c) => c.h).sort((a, b) => b - a);
            const lows = candles.map((c) => c.l).sort((a, b) => a - b);
            return {
              resistance_levels: highs.slice(0, 3),
              support_levels: lows.slice(0, 3),
            };
          } catch {
            return { resistance_levels: [], support_levels: [] };
          }
        });

        const sentinelAgent = createSentinelAgent(undefined, toolHandlers);

        const sentinelRequest: SentinelRequest = {
          bundle: data.bundle as RealtimeBundle,
          strategy_id: userContext?.strategyId,
        };

        // Log the bundle received from client
        const bundle = data.bundle as RealtimeBundle;
        console.log('[Sentinel Agent] Bundle received:', {
          symbol: bundle.market_state?.symbol,
          markPrice: bundle.market_state?.mark_price,
          whaleTrades: bundle.whales?.recent_trades?.length ?? 0,
          netFlow: bundle.whales?.net_whale_flow_usd ?? 0,
          flushEvents: bundle.features?.flush_events?.length ?? 0,
          burstEvents: bundle.features?.burst_events?.length ?? 0,
          dominantDirection: bundle.whales?.dominant_direction,
        });

        const sentinelResult = await sentinelAgent.analyze(sentinelRequest, context);

        // Log the Sentinel decision for debugging
        console.log('[Sentinel Agent] Analysis complete:', {
          symbol: data.bundle.market_state.symbol,
          decision: sentinelResult.response.decision,
          confidence: sentinelResult.response.confidence,
          recommendation: sentinelResult.response.recommendation,
          patternType: sentinelResult.response.pattern?.type,
          patternSetup: sentinelResult.response.pattern?.setup,
          reasoning: sentinelResult.response.thesis?.reasoning?.substring(0, 200),
        });

        // Validate alert before storing
        const validation = await validateSentinelAlert(
          client,
          user.id,
          data.bundle.market_state.symbol,
          data.bundle.market_state.mark_price,
          sentinelResult.response
        );

        // If validation fails, modify the response to NO_ALERT and add reason
        let finalResponse = sentinelResult.response;
        if (!validation.isValid && sentinelResult.response.decision === 'ALERT') {
          console.log('[Sentinel Agent] Alert blocked by validation:', validation.reason);
          finalResponse = {
            ...sentinelResult.response,
            decision: 'NO_ALERT',
            recommendation: 'WAIT',
            risk_notes: [
              ...(sentinelResult.response.risk_notes || []),
              `[BLOCKED] ${validation.reason}`,
            ],
          };
        }

        // Store alert if decision is ALERT and validation passed
        if (finalResponse.decision === 'ALERT' && finalResponse.pattern) {
          const alertSetup = finalResponse.pattern.setup === 'LONG_SETUP' ? 'LONG' :
                            finalResponse.pattern.setup === 'SHORT_SETUP' ? 'SHORT' : 'NONE';

          // Store trace first to get ID
          const { data: traceData } = await client.from('agent_traces').insert({
            user_id: user.id,
            agent_name: 'sentinel',
            strategy_id: context.strategyId || null,
            input_summary: `${data.bundle.market_state.symbol} sentinel analysis`,
            output_json: sentinelResult.trace.output as Json,
            tokens_input: sentinelResult.trace.tokensInput,
            tokens_output: sentinelResult.trace.tokensOutput,
            latency_ms: sentinelResult.trace.latencyMs,
            model_used: sentinelResult.trace.model,
            cost_usd: sentinelResult.trace.costUsd,
          }).select('id').single();

          // Insert alert
          await client.from('agent_alerts').insert({
            user_id: user.id,
            strategy_id: context.strategyId || null,
            agent_trace_id: traceData?.id || null,
            symbol: data.bundle.market_state.symbol,
            decision: finalResponse.decision,
            setup: alertSetup,
            pattern_json: finalResponse.pattern as unknown as Json,
            thesis_json: finalResponse.thesis as unknown as Json || {},
            execution_json: finalResponse.execution_candidate as unknown as Json || null,
            confidence: finalResponse.confidence,
            recommendation: finalResponse.recommendation,
            risk_notes: finalResponse.risk_notes,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
          });

          console.log('[Sentinel Agent] ✅ Alert stored successfully');
        } else {
          // Still store trace even if no alert (or blocked)
          const blockedReason = !validation.isValid ? ` (blocked: ${validation.reason})` : '';
          await client.from('agent_traces').insert({
            user_id: user.id,
            agent_name: 'sentinel',
            strategy_id: context.strategyId || null,
            input_summary: `${data.bundle.market_state.symbol} sentinel analysis (no alert${blockedReason})`,
            output_json: sentinelResult.trace.output as Json,
            tokens_input: sentinelResult.trace.tokensInput,
            tokens_output: sentinelResult.trace.tokensOutput,
            latency_ms: sentinelResult.trace.latencyMs,
            model_used: sentinelResult.trace.model,
            cost_usd: sentinelResult.trace.costUsd,
          });
        }

        return NextResponse.json({
          response: finalResponse,
          trace: {
            agentName: sentinelResult.trace.agentName,
            latencyMs: sentinelResult.trace.latencyMs,
            tokensUsed: sentinelResult.trace.tokensInput + sentinelResult.trace.tokensOutput,
            costUsd: sentinelResult.trace.costUsd,
          },
          validation: !validation.isValid ? { blocked: true, reason: validation.reason } : undefined,
        });
      }

      // ========================================================================
      // SENTINEL V2 - DUAL ALERT SYSTEM (RISK_ALERT + TRADE_ALERT)
      // ========================================================================
      case 'sentinel-v2': {
        // Reuse tool handlers from V1
        const toolHandlersV2: ToolHandlers = new Map();

        toolHandlersV2.set('get_market_data', async (args) => {
          try {
            const info = createHyperliquidInfo();
            const allData = await info.getParsedAssetCtxs();
            return allData.find((d) => d.coin === args.symbol) || { error: 'Symbol not found' };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to fetch market data' };
          }
        });

        toolHandlersV2.set('get_whale_events', async (args) => {
          const minutesBack = typeof args.minutes_back === 'number' ? args.minutes_back : 30;
          const symbolStr = typeof args.symbol === 'string' ? args.symbol : '';
          const { data: whaleEvents } = await client
            .from('whale_events')
            .select('*')
            .eq('symbol', symbolStr)
            .gte('ts', new Date(Date.now() - minutesBack * 60000).toISOString())
            .order('ts', { ascending: false })
            .limit(20);
          return whaleEvents || [];
        });

        toolHandlersV2.set('get_risk_state', async () => {
          const today = new Date().toISOString().split('T')[0]!;
          const { data: riskState } = await client
            .from('risk_bumpers_state')
            .select('*')
            .eq('user_id', user.id)
            .eq('trading_day', today)
            .single();
          return riskState || {
            daily_loss_usd: 0,
            daily_trades_count: 0,
            cooldown_active: false,
            kill_switch_active: false,
          };
        });

        toolHandlersV2.set('get_price_levels', async (args) => {
          try {
            const info = createHyperliquidInfo();
            const now = Date.now();
            const symbolStr = typeof args.symbol === 'string' ? args.symbol : 'BTC';
            const candles = await info.getCandles(
              symbolStr,
              '1h',
              now - 24 * 60 * 60 * 1000,
              now
            );
            const highs = candles.map((c) => c.h).sort((a, b) => b - a);
            const lows = candles.map((c) => c.l).sort((a, b) => a - b);
            return {
              resistance_levels: highs.slice(0, 3),
              support_levels: lows.slice(0, 3),
            };
          } catch {
            return { resistance_levels: [], support_levels: [] };
          }
        });

        const sentinelAgentV2 = createSentinelAgent(undefined, toolHandlersV2);
        const bundleV2 = data.bundle as RealtimeBundleV2;

        console.log('[Sentinel V2] Bundle received:', {
          symbol: bundleV2.market_state?.symbol,
          markPrice: bundleV2.market_state?.mark_price,
          dynamicThreshold: bundleV2.dynamic_whale_threshold,
          atrPercent: bundleV2.atr_percent,
          tf10m_flow: bundleV2.timeframe_context?.tf_10m?.whale_net_flow_usd ?? 0,
          tf1h_flow: bundleV2.timeframe_context?.tf_1h?.whale_net_flow_usd ?? 0,
        });

        // Use V2 analysis method
        const sentinelResultV2 = await sentinelAgentV2.analyzeV2(
          { bundle: bundleV2, strategy_id: userContext?.strategyId },
          context
        );

        console.log('[Sentinel V2] Analysis complete:', {
          symbol: bundleV2.market_state.symbol,
          decision: sentinelResultV2.response.decision,
          riskConfidence: sentinelResultV2.response.risk_confidence,
          setupConfidence: sentinelResultV2.response.setup_confidence,
          alertsCount: sentinelResultV2.response.alerts.length,
          alertTypes: sentinelResultV2.response.alerts.map(a => a.type),
        });

        // Store trace first
        const { data: traceDataV2 } = await client.from('agent_traces').insert({
          user_id: user.id,
          agent_name: 'sentinel-v2',
          strategy_id: context.strategyId || null,
          input_summary: `${bundleV2.market_state.symbol} sentinel-v2 analysis`,
          output_json: sentinelResultV2.trace.output as Json,
          tokens_input: sentinelResultV2.trace.tokensInput,
          tokens_output: sentinelResultV2.trace.tokensOutput,
          latency_ms: sentinelResultV2.trace.latencyMs,
          model_used: sentinelResultV2.trace.model,
          cost_usd: sentinelResultV2.trace.costUsd,
        }).select('id').single();

        // Process each alert in the response
        const storedAlerts: { type: AlertType; id?: string; action: string }[] = [];

        for (const alert of sentinelResultV2.response.alerts) {
          // Check window-based cooldown
          const windowCheck = await checkAlertWindowV2(
            client,
            user.id,
            bundleV2.market_state.symbol,
            alert.type
          );

          // Validate confidence thresholds
          const meetsConfidence = alert.type === 'RISK_ALERT'
            ? alert.confidence >= SENTINEL_V2_CONFIG.MIN_RISK_CONFIDENCE
            : alert.confidence >= SENTINEL_V2_CONFIG.MIN_SETUP_CONFIDENCE;

          // For TRADE_ALERT, also check confirmations
          const meetsConfirmations = alert.type === 'TRADE_ALERT'
            ? countConfirmations(alert.pattern || {}) >= SENTINEL_V2_CONFIG.MIN_CONFIRMATIONS
            : true;

          if (!meetsConfidence) {
            storedAlerts.push({
              type: alert.type,
              action: `skipped: confidence ${(alert.confidence * 100).toFixed(0)}% below threshold`,
            });
            continue;
          }

          if (!meetsConfirmations) {
            storedAlerts.push({
              type: alert.type,
              action: `skipped: insufficient confirmations`,
            });
            continue;
          }

          if (!windowCheck.canEmit && !windowCheck.updateAlertId) {
            storedAlerts.push({
              type: alert.type,
              action: `skipped: ${windowCheck.reason}`,
            });
            continue;
          }

          // Merge alert-level data with top-level fallbacks from V2 response
          // The LLM may place pattern/thesis/execution at the alert level OR at the top level
          const effectivePattern = alert.pattern || sentinelResultV2.response.pattern || undefined;
          const effectiveThesis = alert.thesis || sentinelResultV2.response.thesis || undefined;
          const effectiveExecution = alert.execution_candidate || sentinelResultV2.response.execution_candidate || undefined;

          // Determine setup from pattern — must be LONG or SHORT for TRADE_ALERTs
          const patternSetup = effectivePattern?.setup;
          const alertSetup: 'LONG' | 'SHORT' | 'NONE' =
            patternSetup === 'LONG_SETUP' ? 'LONG' :
            patternSetup === 'SHORT_SETUP' ? 'SHORT' : 'NONE';

          // RISK_ALERTs are informational only — log them but don't store in agent_alerts
          // They were flooding the table and causing Atlas Entry to waste cycles dismissing them
          if (alert.type === 'RISK_ALERT') {
            storedAlerts.push({
              type: alert.type,
              action: 'logged_only: risk alerts are informational',
              risk_type: alert.risk_type,
              risk_level: alert.risk_level,
              confidence: alert.confidence,
            });
            console.log(`[Sentinel V2] ℹ️ RISK_ALERT logged (not stored): ${alert.risk_type} ${alert.risk_level} ${(alert.confidence * 100).toFixed(0)}%`);
            continue;
          }

          // Skip TRADE_ALERTs without valid setup or execution data
          if (alert.type === 'TRADE_ALERT') {
            if (alertSetup === 'NONE') {
              storedAlerts.push({
                type: alert.type,
                action: 'skipped: no valid setup (LONG/SHORT) in pattern',
              });
              console.warn(`[Sentinel V2] ⚠️ TRADE_ALERT skipped: pattern.setup is ${patternSetup || 'undefined'}`);
              continue;
            }
            if (!effectiveExecution?.entry_zone?.min && !effectiveExecution?.entry_zone?.max) {
              storedAlerts.push({
                type: alert.type,
                action: 'skipped: no valid entry_zone in execution_candidate',
              });
              console.warn(`[Sentinel V2] ⚠️ TRADE_ALERT skipped: no entry_zone data`);
              continue;
            }
          }

          const alertData = {
            user_id: user.id,
            strategy_id: context.strategyId || null,
            agent_trace_id: traceDataV2?.id || null,
            symbol: bundleV2.market_state.symbol,
            decision: 'ALERT' as const,
            setup: alertSetup,
            alert_type: alert.type,
            risk_type: alert.risk_type || null,
            risk_level: alert.risk_level || null,
            timeframe: alert.timeframe,
            pattern_json: (effectivePattern || {}) as unknown as Json,
            thesis_json: (effectiveThesis || {}) as unknown as Json,
            execution_json: effectiveExecution as unknown as Json || null,
            confidence: alert.confidence,
            risk_confidence: sentinelResultV2.response.risk_confidence,
            setup_confidence: sentinelResultV2.response.setup_confidence,
            recommendation: sentinelResultV2.response.recommendation,
            risk_notes: sentinelResultV2.response.risk_notes,
            timeframe_context: bundleV2.timeframe_context as unknown as Json,
            expires_at: new Date(alert.expires_at).toISOString(),
            updates_alert_id: windowCheck.updateAlertId || null,
          };

          if (windowCheck.updateAlertId) {
            // Update existing alert
            await client.from('agent_alerts')
              .update({
                ...alertData,
                updated_at: new Date().toISOString(),
              })
              .eq('id', windowCheck.updateAlertId)
              .eq('user_id', user.id);

            storedAlerts.push({
              type: alert.type,
              id: windowCheck.updateAlertId,
              action: 'updated',
            });
            console.log(`[Sentinel V2] ✅ ${alert.type} updated: ${windowCheck.updateAlertId}`);
          } else {
            // Insert new alert
            const { data: insertedAlert } = await client.from('agent_alerts')
              .insert(alertData)
              .select('id')
              .single();

            storedAlerts.push({
              type: alert.type,
              id: insertedAlert?.id,
              action: 'created',
            });
            console.log(`[Sentinel V2] ✅ ${alert.type} created: ${insertedAlert?.id}`);
          }
        }

        return NextResponse.json({
          response: sentinelResultV2.response,
          trace: {
            agentName: sentinelResultV2.trace.agentName,
            latencyMs: sentinelResultV2.trace.latencyMs,
            tokensUsed: sentinelResultV2.trace.tokensInput + sentinelResultV2.trace.tokensOutput,
            costUsd: sentinelResultV2.trace.costUsd,
          },
          storedAlerts,
        });
      }

      // ========================================================================
      // ATLAS ENTRY GATEKEEPING (5-minute interval)
      // ========================================================================
      case 'atlas-entry': {
        const atlasToolHandlers: ToolHandlers = new Map();

        atlasToolHandlers.set('get_current_price', async (args) => {
          try {
            const info = createHyperliquidInfo();
            const allData = await info.getParsedAssetCtxs();
            const asset = allData.find((d) => d.coin === args.symbol);
            return asset ? { mid: asset.markPrice, bid: asset.markPrice * 0.999, ask: asset.markPrice * 1.001 } : { error: 'Symbol not found' };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to fetch price' };
          }
        });

        atlasToolHandlers.set('get_liquidation_data', async () => {
          // Note: liquidation_events table may not exist yet - return empty data
          return {
            total_usd: 0,
            longs_usd: 0,
            shorts_usd: 0,
          };
        });

        atlasToolHandlers.set('get_order_status', async (args) => {
          const orderId = String(args.order_id || '');
          const { data: order} = await client
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .eq('broker', 'binance')
            .single();
          return order || { error: 'Order not found' };
        });

        atlasToolHandlers.set('get_position_details', async (args) => {
          const tradeId = String(args.trade_id || '');
          const { data: position } = await client
            .from('orders')
            .select('*')
            .eq('id', tradeId)
            .eq('broker', 'binance')
            .in('status', ['submitted', 'partially_filled'])
            .single();
          return position || { error: 'Position not found' };
        });

        console.log('[Atlas Entry] Creating agent...');
        const atlasAgent = createAtlasAgent(undefined, atlasToolHandlers);
        const entryBundle = data.bundle as AtlasEntryBundle;

        console.log('[Atlas Entry] Bundle received:', {
          candidates: entryBundle.alert_candidates?.length ?? 0,
          equity: entryBundle.portfolio_state?.equity_usd,
          killSwitch: entryBundle.portfolio_state?.kill_switch_active,
        });

        const atlasEntryRequest: AtlasEntryRequest = {
          bundle: entryBundle,
          strategy_id: userContext?.strategyId,
        };

        console.log('[Atlas Entry] Calling OpenAI agent...');
        let entryResult;
        let entryResponse: AtlasEntryResponse;
        try {
          entryResult = await atlasAgent.analyzeEntries(atlasEntryRequest, context);
          entryResponse = entryResult.response as AtlasEntryResponse;
        } catch (agentError) {
          console.error('[Atlas Entry] Agent error:', agentError);
          return NextResponse.json(
            { error: `Atlas Entry Agent failed: ${agentError instanceof Error ? agentError.message : 'Unknown error'}` },
            { status: 500 }
          );
        }

        console.log('[Atlas Entry] Analysis complete:', {
          globalStatus: entryResponse.global_governor.status,
          globalAction: entryResponse.global_governor.action,
          entriesApproved: entryResponse.entry_gatekeeping.filter(e => e.decision === 'APPROVE_ENTRY').length,
          entriesWait: entryResponse.entry_gatekeeping.filter(e => e.decision === 'WAIT').length,
          entriesBlocked: entryResponse.entry_gatekeeping.filter(e => e.decision === 'BLOCK').length,
        });

        // Store Atlas cycle record (non-blocking - table may not exist yet)
        const cycleId = entryResponse.analysis_log.cycle_id;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (client as any).from('atlas_cycles').insert({
            user_id: user.id,
            cycle_id: cycleId,
            cycle_type: 'entry',
            cycle_ts: new Date().toISOString(),
            global_status: entryResponse.global_governor.status,
            global_action: entryResponse.global_governor.action,
            global_reasons: entryResponse.global_governor.reasons,
            entries_approved: entryResponse.entry_gatekeeping.filter(e => e.decision === 'APPROVE_ENTRY').length,
            entries_wait: entryResponse.entry_gatekeeping.filter(e => e.decision === 'WAIT').length,
            entries_blocked: entryResponse.entry_gatekeeping.filter(e => e.decision === 'BLOCK').length,
            trades_reviewed: 0,
            total_actions_proposed: 0,
            full_response_json: entryResponse as unknown as Json,
            latency_ms: entryResult.trace.latencyMs,
            tokens_input: entryResult.trace.tokensInput,
            tokens_output: entryResult.trace.tokensOutput,
            cost_usd: entryResult.trace.costUsd,
          });
        } catch (dbError) {
          console.warn('[Atlas Entry] Failed to store cycle (table may not exist):', dbError);
        }

        // Update alert status based on decisions (non-blocking)
        for (const decision of entryResponse.entry_gatekeeping) {
          const newStatus = decision.decision === 'APPROVE_ENTRY' ? 'actioned' :
                           decision.decision === 'BLOCK' ? 'dismissed' : 'new';

          if (newStatus !== 'new') {
            try {
              await client
                .from('agent_alerts')
                .update({
                  status: newStatus,
                  actioned_at: newStatus === 'actioned' ? new Date().toISOString() : null,
                })
                .eq('id', decision.candidate_id)
                .eq('user_id', user.id);
              console.log(`[Atlas Entry] Alert ${decision.candidate_id} marked as ${newStatus}`);
            } catch (alertError) {
              console.warn('[Atlas Entry] Failed to update alert status:', alertError);
            }
          }
        }

        // Store trace (non-blocking)
        try {
          await client.from('agent_traces').insert({
            user_id: user.id,
            agent_name: 'atlas-entry',
            strategy_id: context.strategyId || null,
            input_summary: `Atlas Entry Gatekeeping: ${entryBundle.alert_candidates.length} candidates`,
            output_json: entryResult.trace.output as Json,
            tokens_input: entryResult.trace.tokensInput,
            tokens_output: entryResult.trace.tokensOutput,
            latency_ms: entryResult.trace.latencyMs,
            model_used: entryResult.trace.model,
            cost_usd: entryResult.trace.costUsd,
          });
        } catch (traceError) {
          console.warn('[Atlas Entry] Failed to store trace:', traceError);
        }

        return NextResponse.json({
          response: entryResponse,
          trace: {
            agentName: entryResult.trace.agentName,
            latencyMs: entryResult.trace.latencyMs,
            tokensUsed: entryResult.trace.tokensInput + entryResult.trace.tokensOutput,
            costUsd: entryResult.trace.costUsd,
          },
        });
      }

      // ========================================================================
      // ATLAS TRADE MANAGEMENT (10-minute interval)
      // ========================================================================
      case 'atlas-trades': {
        const atlasToolHandlers: ToolHandlers = new Map();

        atlasToolHandlers.set('get_current_price', async (args) => {
          try {
            const info = createHyperliquidInfo();
            const allData = await info.getParsedAssetCtxs();
            const asset = allData.find((d) => d.coin === args.symbol);
            return asset ? { mid: asset.markPrice, bid: asset.markPrice * 0.999, ask: asset.markPrice * 1.001 } : { error: 'Symbol not found' };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to fetch price' };
          }
        });

        atlasToolHandlers.set('get_liquidation_data', async () => {
          // Note: liquidation_events table may not exist yet - return empty data
          return {
            total_usd: 0,
            longs_usd: 0,
            shorts_usd: 0,
          };
        });

        atlasToolHandlers.set('get_order_status', async (args) => {
          const orderId = String(args.order_id || '');
          const { data: order} = await client
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .eq('broker', 'binance')
            .single();
          return order || { error: 'Order not found' };
        });

        atlasToolHandlers.set('get_position_details', async (args) => {
          const tradeId = String(args.trade_id || '');
          const { data: position } = await client
            .from('orders')
            .select('*')
            .eq('id', tradeId)
            .eq('broker', 'binance')
            .in('status', ['submitted', 'partially_filled'])
            .single();
          return position || { error: 'Position not found' };
        });

        console.log('[Atlas Trades] Creating agent...');
        const atlasAgent = createAtlasAgent(undefined, atlasToolHandlers);
        const tradeBundle = data.bundle as AtlasTradeBundle;

        console.log('[Atlas Trades] Bundle received:', {
          openTrades: tradeBundle.open_trades?.length ?? 0,
          equity: tradeBundle.portfolio_state?.equity_usd,
          killSwitch: tradeBundle.portfolio_state?.kill_switch_active,
        });

        const atlasTradeRequest: AtlasTradeRequest = {
          bundle: tradeBundle,
          strategy_id: userContext?.strategyId,
        };

        console.log('[Atlas Trades] Calling OpenAI agent...');
        let tradeResult;
        let tradeResponse: AtlasTradeResponse;
        try {
          tradeResult = await atlasAgent.manageTrades(atlasTradeRequest, context);
          tradeResponse = tradeResult.response as AtlasTradeResponse;
        } catch (agentError) {
          console.error('[Atlas Trades] Agent error:', agentError);
          return NextResponse.json(
            { error: `Atlas Trades Agent failed: ${agentError instanceof Error ? agentError.message : 'Unknown error'}` },
            { status: 500 }
          );
        }

        console.log('[Atlas Trades] Analysis complete:', {
          globalStatus: tradeResponse.global_governor.status,
          globalAction: tradeResponse.global_governor.action,
          tradesReviewed: tradeResponse.trade_management.length,
          totalActions: tradeResponse.trade_management.reduce((sum, tm) => sum + (tm.actions?.length || 0), 0),
        });

        // Store Atlas cycle record (non-blocking - table may not exist yet)
        const cycleId = tradeResponse.analysis_log.cycle_id;
        const totalActions = tradeResponse.trade_management.reduce((sum, tm) => sum + (tm.actions?.length || 0), 0);

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (client as any).from('atlas_cycles').insert({
            user_id: user.id,
            cycle_id: cycleId,
            cycle_type: 'trade',
            cycle_ts: new Date().toISOString(),
            global_status: tradeResponse.global_governor.status,
            global_action: tradeResponse.global_governor.action,
            global_reasons: tradeResponse.global_governor.reasons,
            entries_approved: 0,
            entries_wait: 0,
            entries_blocked: 0,
            trades_reviewed: tradeResponse.trade_management.length,
            total_actions_proposed: totalActions,
            improvement_plan_json: tradeResponse.improvement_plan as unknown as Json,
            full_response_json: tradeResponse as unknown as Json,
            latency_ms: tradeResult.trace.latencyMs,
            tokens_input: tradeResult.trace.tokensInput,
            tokens_output: tradeResult.trace.tokensOutput,
            cost_usd: tradeResult.trace.costUsd,
          });
        } catch (dbError) {
          console.warn('[Atlas Trades] Failed to store cycle (table may not exist):', dbError);
        }

        // Store reviews and decisions for each trade (non-blocking)
        for (const tm of tradeResponse.trade_management) {
          try {
            // Insert review
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: reviewData } = await (client as any).from('atlas_reviews').insert({
              user_id: user.id,
              trade_id: tm.trade_id,
              cycle_id: cycleId,
              progress_assessment: tm.review.progress_assessment,
              category: tm.category,
              mfe_usd: tm.risk_snapshot.mfe_usd || 0,
              mae_usd: tm.risk_snapshot.mae_usd || 0,
              unrealized_pnl_usd: tm.risk_snapshot.unrealized_pnl_usd || 0,
              age_sec: tm.risk_snapshot.age_sec || 0,
              actions_proposed: tm.actions as unknown as Json,
              notes_json: {
                management_thesis: tm.management_thesis,
                profit_optimization_notes: tm.profit_optimization_notes,
                confidence: tm.confidence,
              } as unknown as Json,
            }).select('id').single();

            // Insert decisions for each action
            if (tm.actions && tm.actions.length > 0) {
              for (const action of tm.actions) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (client as any).from('atlas_decisions').insert({
                  user_id: user.id,
                  trade_id: tm.trade_id,
                  review_id: reviewData?.id || null,
                  action_type: action.type,
                  payload_json: action.payload as unknown as Json,
                  status: 'pending',
                });
              }
            }

            // TODO: Update order with review info
            // Note: orders table doesn't have last_review_ts, review_count, mfe_usd, mae_usd yet
            // Need to add these columns or store in a separate trade_tracking table
            // For now, skip this update to avoid errors
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const _reviewUpdate = {
              last_review_ts: new Date().toISOString(),
              review_count: (tradeBundle.open_trades.find(t => t.trade_id === tm.trade_id)?.review_count ?? 0) + 1,
              mfe_usd: tm.risk_snapshot.mfe_usd || 0,
              mae_usd: tm.risk_snapshot.mae_usd || 0,
            };
          } catch (reviewError) {
            console.warn(`[Atlas Trades] Failed to store review for trade ${tm.trade_id}:`, reviewError);
          }
        }

        // Store trace (non-blocking)
        try {
          await client.from('agent_traces').insert({
            user_id: user.id,
            agent_name: 'atlas-trades',
            strategy_id: context.strategyId || null,
            input_summary: `Atlas Trade Management: ${tradeBundle.open_trades.length} trades`,
            output_json: tradeResult.trace.output as Json,
            tokens_input: tradeResult.trace.tokensInput,
            tokens_output: tradeResult.trace.tokensOutput,
            latency_ms: tradeResult.trace.latencyMs,
            model_used: tradeResult.trace.model,
            cost_usd: tradeResult.trace.costUsd,
          });
        } catch (traceError) {
          console.warn('[Atlas Trades] Failed to store trace:', traceError);
        }

        return NextResponse.json({
          response: tradeResponse,
          trace: {
            agentName: tradeResult.trace.agentName,
            latencyMs: tradeResult.trace.latencyMs,
            tokensUsed: tradeResult.trace.tokensInput + tradeResult.trace.tokensOutput,
            costUsd: tradeResult.trace.costUsd,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    // Store trace in database
    const { trace, response } = result;

    await client.from('agent_traces').insert({
      user_id: user.id,
      agent_name: trace.agentName,
      strategy_id: context.strategyId || null,
      signal_id: context.signalId || null,
      intent_id: context.intentId || null,
      input_summary: JSON.stringify(data).substring(0, 500),
      output_json: trace.output as Json,
      tokens_input: trace.tokensInput,
      tokens_output: trace.tokensOutput,
      latency_ms: trace.latencyMs,
      model_used: trace.model,
      cost_usd: trace.costUsd,
    });

    return NextResponse.json({
      response,
      trace: {
        agentName: trace.agentName,
        latencyMs: trace.latencyMs,
        tokensUsed: trace.tokensInput + trace.tokensOutput,
        costUsd: trace.costUsd,
      },
    });
  } catch (error) {
    console.error('Error calling agent:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

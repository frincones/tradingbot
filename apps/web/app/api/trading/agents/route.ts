/**
 * AI Agents API
 * OpenAI agent interactions for trading
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { createTradingAgents, createSentinelAgent, type ToolHandlers } from '@kit/integrations/openai';
import { createHyperliquidInfo } from '@kit/integrations/hyperliquid';
import type {
  ExplanationRequest,
  SupervisionRequest,
  ReportRequest,
  OptimizationRequest,
  AgentContext,
} from '@kit/integrations/openai';
import type { Json } from '@kit/supabase/database';
import type { RealtimeBundle, SentinelRequest, SentinelResponse } from '@kit/trading-core';

// ============================================================================
// SENTINEL AGENT CONFIGURATION
// ============================================================================

const SENTINEL_CONFIG = {
  // Minimum confidence threshold (0.80 = 80%)
  MIN_CONFIDENCE: 0.80,
  // Cooldown between alerts for same symbol (5 minutes)
  COOLDOWN_MS: 5 * 60 * 1000,
  // Minimum Risk/Reward ratio
  MIN_RISK_REWARD: 1.5,
  // Minimum stop loss distance from entry (1%)
  MIN_STOP_LOSS_PCT: 1.0,
  // Block conflicting positions (opposite direction)
  BLOCK_CONFLICTING_POSITIONS: true,
};

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
 * Check if there are open paper orders in conflicting direction
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

  const { data: openOrders } = await client
    .from('paper_orders')
    .select('id, side, entry_price')
    .eq('user_id', userId)
    .eq('symbol', symbol)
    .eq('status', 'open');

  if (openOrders && openOrders.length > 0) {
    const orders = openOrders as Array<{ id: string; side: string; entry_price: number }>;
    const hasConflicting = orders.some(
      (order) => order.side !== proposedSetup
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

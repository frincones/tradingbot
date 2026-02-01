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
import type { RealtimeBundle, SentinelRequest } from '@kit/trading-core';

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

        // Store alert if decision is ALERT
        if (sentinelResult.response.decision === 'ALERT' && sentinelResult.response.pattern) {
          const alertSetup = sentinelResult.response.pattern.setup === 'LONG_SETUP' ? 'LONG' :
                            sentinelResult.response.pattern.setup === 'SHORT_SETUP' ? 'SHORT' : 'NONE';

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
            decision: sentinelResult.response.decision,
            setup: alertSetup,
            pattern_json: sentinelResult.response.pattern as unknown as Json,
            thesis_json: sentinelResult.response.thesis as unknown as Json || {},
            execution_json: sentinelResult.response.execution_candidate as unknown as Json || null,
            confidence: sentinelResult.response.confidence,
            recommendation: sentinelResult.response.recommendation,
            risk_notes: sentinelResult.response.risk_notes,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
          });
        } else {
          // Still store trace even if no alert
          await client.from('agent_traces').insert({
            user_id: user.id,
            agent_name: 'sentinel',
            strategy_id: context.strategyId || null,
            input_summary: `${data.bundle.market_state.symbol} sentinel analysis (no alert)`,
            output_json: sentinelResult.trace.output as Json,
            tokens_input: sentinelResult.trace.tokensInput,
            tokens_output: sentinelResult.trace.tokensOutput,
            latency_ms: sentinelResult.trace.latencyMs,
            model_used: sentinelResult.trace.model,
            cost_usd: sentinelResult.trace.costUsd,
          });
        }

        return NextResponse.json({
          response: sentinelResult.response,
          trace: {
            agentName: sentinelResult.trace.agentName,
            latencyMs: sentinelResult.trace.latencyMs,
            tokensUsed: sentinelResult.trace.tokensInput + sentinelResult.trace.tokensOutput,
            costUsd: sentinelResult.trace.costUsd,
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

'use client';

/**
 * Atlas Entry Gatekeeping Hook
 * Analyzes pending alerts (status='new') and decides whether to approve, wait, or block entries
 * Runs every 5 minutes (configurable)
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';
import type {
  AtlasEntryBundle,
  AtlasEntryResponse,
  AtlasAlertCandidate,
  AtlasMarketRealtime,
  AtlasIndicatorsInternal,
  AtlasPortfolioState,
  AtlasGuardrails,
} from '@kit/trading-core';

// ============================================================================
// TYPES
// ============================================================================

export interface UseAtlasEntryGatekeepingOptions {
  /** Symbol to monitor (e.g., 'BTC') */
  symbol: string;
  /** Enable/disable the hook */
  enabled?: boolean;
  /** Analysis interval in milliseconds (default: 300000 = 5 minutes) */
  analysisIntervalMs?: number;
  /** Callback when analysis starts */
  onAnalysisStart?: () => void;
  /** Callback when analysis completes */
  onAnalysisComplete?: (result: AtlasEntryResponse) => void;
  /** Callback when analysis errors */
  onAnalysisError?: (error: Error) => void;
  /** Callback when an entry is approved */
  onEntryApproved?: (candidateId: string, response: AtlasEntryResponse) => void;
}

export interface AtlasEntryGatekeepingState {
  isAnalyzing: boolean;
  lastAnalysis: Date | null;
  lastResponse: AtlasEntryResponse | null;
  cycleCount: number;
  approvedCount: number;
  blockedCount: number;
  pendingAlertsCount: number;
  globalStatus: 'NORMAL' | 'CAUTION' | 'EMERGENCY' | null;
  error: string | null;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_ANALYSIS_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useAtlasEntryGatekeeping(options: UseAtlasEntryGatekeepingOptions) {
  const {
    symbol,
    enabled = true,
    analysisIntervalMs = DEFAULT_ANALYSIS_INTERVAL,
    onAnalysisStart,
    onAnalysisComplete,
    onAnalysisError,
    onEntryApproved,
  } = options;

  const [state, setState] = useState<AtlasEntryGatekeepingState>({
    isAnalyzing: false,
    lastAnalysis: null,
    lastResponse: null,
    cycleCount: 0,
    approvedCount: 0,
    blockedCount: 0,
    pendingAlertsCount: 0,
    globalStatus: null,
    error: null,
  });

  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef(false);
  const triggerAnalysisRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ============================================================================
  // FETCH PENDING ALERTS
  // ============================================================================

  const fetchPendingAlerts = useCallback(async (): Promise<AtlasAlertCandidate[]> => {
    const supabase = getSupabaseBrowserClient();

    // First, bulk-dismiss any stale alerts with setup=NONE (RISK_ALERTs or invalid TRADE_ALERTs)
    // This cleans up the table so they don't keep appearing in queries
    const { count: dismissedCount } = await supabase
      .from('agent_alerts')
      .update({ status: 'dismissed' as const, action_taken: 'bulk_cleanup_none_setup' })
      .eq('symbol', symbol)
      .eq('status', 'new')
      .eq('setup', 'NONE');

    if (dismissedCount && dismissedCount > 0) {
      console.log(`[Atlas Entry] Bulk-dismissed ${dismissedCount} NONE-setup alerts`);
    }

    // Only fetch TRADE_ALERTs with valid LONG/SHORT setup
    const { data: alerts, error } = await supabase
      .from('agent_alerts')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'new')
      .eq('decision', 'ALERT')
      .in('setup', ['LONG', 'SHORT'])
      .order('confidence', { ascending: false })
      .limit(3);

    if (error) {
      console.error('[Atlas Entry] Error fetching alerts:', error);
      return [];
    }

    if (!alerts || alerts.length === 0) {
      console.log('[Atlas Entry] No pending alerts found');
      return [];
    }

    console.log('[Atlas Entry] Found', alerts.length, 'pending alerts');

    // Convert alerts to AtlasAlertCandidate format
    // Handle both V1 and V2 alert structures
    const candidates: AtlasAlertCandidate[] = [];

    for (const alert of alerts) {
      const pattern = alert.pattern_json as Record<string, unknown> | null;
      const thesis = alert.thesis_json as Record<string, unknown> | null;
      const execution = alert.execution_json as Record<string, unknown> | null;

      // Setup is guaranteed to be LONG or SHORT by the query filter
      const setup = alert.setup as string;
      if (setup !== 'LONG' && setup !== 'SHORT') {
        // Safety check — shouldn't happen after query filter
        console.warn('[Atlas Entry] Unexpected setup in filtered results:', alert.id, 'setup:', setup);
        continue;
      }

      // Extract entry zone with flexible nesting
      const entryZone = execution?.entry_zone as { min?: number; max?: number; ideal?: number } | undefined;
      const entryMin = entryZone?.min || 0;
      const entryMax = entryZone?.max || 0;
      const entryIdeal = entryZone?.ideal || ((entryMin + entryMax) / 2) || 0;

      // Extract stop loss (can be number or {price: number})
      const rawSl = execution?.stop_loss;
      const stopLoss = typeof rawSl === 'object' && rawSl !== null
        ? (rawSl as { price?: number }).price || 0
        : typeof rawSl === 'number' ? rawSl : 0;

      // Extract take profit (can be number or first target)
      const rawTp = execution?.take_profit;
      const tpTargets = execution?.take_profit_targets as Array<{ price?: number }> | undefined;
      const takeProfit = typeof rawTp === 'number'
        ? rawTp
        : tpTargets?.[0]?.price || 0;

      // Extract thesis summary from various possible locations
      const thesisSummary = (thesis?.summary as string)
        || (thesis?.title as string)
        || (thesis?.reasoning as string)?.substring(0, 200)
        || '';

      // Extract pattern type
      const patternType = (pattern?.type as string) || 'UNKNOWN';

      // Log what we're sending to Atlas
      console.log('[Atlas Entry] Candidate:', {
        id: alert.id.slice(0, 8),
        setup,
        patternType,
        confidence: alert.confidence,
        entryZone: `$${entryMin}-$${entryMax}`,
        sl: stopLoss,
        tp: takeProfit,
      });

      candidates.push({
        candidate_id: alert.id,
        symbol: alert.symbol,
        setup: setup as 'LONG' | 'SHORT',
        pattern_type: patternType,
        confidence: Number(alert.confidence) || 0,
        entry_zone: {
          min: entryMin,
          max: entryMax,
          ideal: entryIdeal,
        },
        stop_loss: stopLoss,
        take_profit: takeProfit,
        thesis_summary: thesisSummary,
        risk_notes: (alert.risk_notes as string[]) || [],
      });
    }

    return candidates;
  }, [symbol]);

  // ============================================================================
  // FETCH MARKET DATA
  // ============================================================================

  const fetchMarketData = useCallback(async (): Promise<AtlasMarketRealtime | null> => {
    try {
      const response = await fetch(`/api/trading/market-data?type=asset-contexts`);
      if (!response.ok) return null;

      const allAssets = await response.json();
      const asset = allAssets.find((a: { coin: string }) => a.coin === symbol);

      if (!asset) return null;

      // REST API returns ParsedAssetCtx format (markPrice as number)
      // Also handle WS format (markPx as string) for robustness
      const markPrice = typeof asset.markPrice === 'number'
        ? asset.markPrice
        : parseFloat(asset.markPx || '0');
      const fundingRate = typeof asset.funding === 'number'
        ? asset.funding
        : parseFloat(asset.funding || '0');
      const openInterest = typeof asset.openInterest === 'number'
        ? asset.openInterest
        : parseFloat(asset.openInterest || '0');

      if (markPrice <= 0) {
        console.warn('[Atlas Entry] Invalid mark price:', markPrice);
        return null;
      }

      return {
        hl_mid: markPrice,
        hl_bid: markPrice * 0.9999,
        hl_ask: markPrice * 1.0001,
        alpaca_mid: null,
        alpaca_bid: null,
        alpaca_ask: null,
        drift_usd: 0,
        alpaca_spread_usd: null,
        funding_rate: fundingRate,
        open_interest: openInterest,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[Atlas Entry] Error fetching market data:', error);
      return null;
    }
  }, [symbol]);

  // ============================================================================
  // FETCH PORTFOLIO STATE
  // ============================================================================

  const fetchPortfolioState = useCallback(async (): Promise<AtlasPortfolioState> => {
    try {
      const response = await fetch('/api/trading/risk-state');
      if (!response.ok) throw new Error('Failed to fetch risk state');

      const data = await response.json();

      return {
        equity_usd: data.equity_usd || 10000,
        daily_pnl_usd: data.daily_loss_usd || 0,
        daily_dd_limit_usd: data.max_daily_loss_usd || 500,
        daily_trades_count: data.daily_trades_count || 0,
        max_trades_per_day: data.max_trades_per_day || 10,
        cooldown_active: data.cooldown_active || false,
        cooldown_until: data.cooldown_until || null,
        kill_switch_active: data.kill_switch_active || false,
        kill_switch_reason: data.kill_switch_reason || null,
        current_position_value: data.current_position_value || 0,
        max_position_value: data.max_position_value || 10000,
      };
    } catch (error) {
      console.error('[Atlas Entry] Error fetching portfolio state:', error);
      return {
        equity_usd: 10000,
        daily_pnl_usd: 0,
        daily_dd_limit_usd: 500,
        daily_trades_count: 0,
        max_trades_per_day: 10,
        cooldown_active: false,
        cooldown_until: null,
        kill_switch_active: false,
        kill_switch_reason: null,
        current_position_value: 0,
        max_position_value: 10000,
      };
    }
  }, []);

  // ============================================================================
  // BUILD BUNDLE
  // ============================================================================

  // ============================================================================
  // FETCH INDICATORS FROM ALERTS CONTEXT
  // ============================================================================

  const fetchIndicatorsFromAlerts = useCallback(async (): Promise<Partial<AtlasIndicatorsInternal>> => {
    try {
      const supabase = getSupabaseBrowserClient();

      // Get recent alerts to extract real indicators from pattern_json
      // Note: timeframe_context may exist in DB but not in TS types, so we use select('*')
      const { data: recentAlerts } = await supabase
        .from('agent_alerts')
        .select('*')
        .eq('symbol', symbol)
        .eq('decision', 'ALERT')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!recentAlerts || recentAlerts.length === 0) return {};

      // Extract indicators from the most recent alert
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latest = recentAlerts[0] as any;

      // Try to get timeframe_context (V2 column, may not be in TS types)
      const tfCtx = latest?.timeframe_context as Record<string, Record<string, number>> | null | undefined;
      const tf1h = tfCtx?.tf_1h || {};
      const tf10m = tfCtx?.tf_10m || {};

      // Extract pattern scores from pattern_json
      const pattern = latest?.pattern_json as Record<string, unknown> | null;
      const flushScore = typeof pattern?.flush_score === 'number' ? pattern.flush_score : (tf10m.flush_count || 0) * 30;
      const burstScore = typeof pattern?.burst_score === 'number' ? pattern.burst_score : (tf10m.burst_count || 0) * 30;
      const absorptionScore = typeof pattern?.absorption_score === 'number' ? pattern.absorption_score : (tf10m.absorption_count || 0) * 25;

      const whaleNetFlow = tf1h.whale_net_flow_usd || tf10m.whale_net_flow_usd || 0;

      return {
        flush_score: flushScore,
        burst_score: burstScore,
        absorption_score: absorptionScore,
        whale_net_flow_usd: whaleNetFlow,
        whale_dominant_direction: whaleNetFlow > 50000 ? 'buying' : whaleNetFlow < -50000 ? 'selling' : 'neutral',
        reclaim_flag: Boolean(pattern?.confirmations && (pattern.confirmations as Record<string, boolean>).reclaim_confirmed),
        atr_5m: tf1h.volatility_atr || null,
      };
    } catch {
      return {};
    }
  }, [symbol]);

  // ============================================================================
  // BUILD BUNDLE
  // ============================================================================

  const buildBundle = useCallback(async (): Promise<AtlasEntryBundle | null> => {
    const [candidates, marketData, portfolioState, alertIndicators] = await Promise.all([
      fetchPendingAlerts(),
      fetchMarketData(),
      fetchPortfolioState(),
      fetchIndicatorsFromAlerts(),
    ]);

    if (!marketData) {
      console.log('[Atlas Entry] No market data available');
      return null;
    }

    if (candidates.length === 0) {
      console.log('[Atlas Entry] No pending alerts to analyze');
      return null;
    }

    // Build indicators enriched with real data from alerts and market context
    const indicators: AtlasIndicatorsInternal = {
      flush_score: alertIndicators.flush_score ?? 0,
      burst_score: alertIndicators.burst_score ?? 0,
      reclaim_flag: alertIndicators.reclaim_flag ?? false,
      absorption_score: alertIndicators.absorption_score ?? 0,
      whale_net_flow_usd: alertIndicators.whale_net_flow_usd ?? 0,
      whale_dominant_direction: alertIndicators.whale_dominant_direction ?? 'neutral',
      support_levels: [],
      resistance_levels: [],
      atr_1m: null,
      atr_5m: alertIndicators.atr_5m ?? null,
      chop_index: null,
      data_freshness_ms: Date.now() - marketData.timestamp,
      ws_connected: true,
    };

    console.log('[Atlas Entry] Indicators enriched:', {
      flush: indicators.flush_score,
      burst: indicators.burst_score,
      whale: indicators.whale_net_flow_usd,
      direction: indicators.whale_dominant_direction,
      reclaim: indicators.reclaim_flag,
    });

    // Default guardrails
    const guardrails: AtlasGuardrails = {
      drift_block_usd: 50,
      alpaca_spread_wait_usd: 5,
      max_actions_per_cycle: 5,
      max_actions_per_trade: 3,
      min_seconds_between_modifications: 60,
      never_widen_stop: true,
    };

    return {
      now: Date.now(),
      market_realtime: marketData,
      indicators_internal: indicators,
      portfolio_state: portfolioState,
      alert_candidates: candidates,
      guardrails,
    };
  }, [fetchPendingAlerts, fetchMarketData, fetchPortfolioState, fetchIndicatorsFromAlerts]);

  // ============================================================================
  // TRIGGER ANALYSIS
  // ============================================================================

  const triggerAnalysis = useCallback(async () => {
    if (isAnalyzingRef.current || !enabled) return;

    console.log('[Atlas Entry] Starting entry gatekeeping analysis...');

    const bundle = await buildBundle();
    if (!bundle) {
      console.log('[Atlas Entry] No bundle to analyze (no alerts or no market data)');
      return;
    }

    // Update pending count
    setState((s) => ({ ...s, pendingAlertsCount: bundle.alert_candidates.length }));

    console.log('[Atlas Entry] Bundle built:', {
      candidates: bundle.alert_candidates.length,
      equity: bundle.portfolio_state.equity_usd,
      killSwitch: bundle.portfolio_state.kill_switch_active,
    });

    isAnalyzingRef.current = true;
    setState((s) => ({ ...s, isAnalyzing: true, error: null }));
    onAnalysisStart?.();

    // Add timeout to prevent hanging (120 seconds max - OpenAI can be slow)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      console.log('[Atlas Entry] Calling API...');
      const response = await fetch('/api/trading/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          action: 'atlas-entry',
          data: { bundle },
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Analysis failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      const atlasResponse = result.response as AtlasEntryResponse;

      const approved = atlasResponse.entry_gatekeeping.filter(e => e.decision === 'APPROVE_ENTRY');
      const blocked = atlasResponse.entry_gatekeeping.filter(e => e.decision === 'BLOCK');
      const waited = atlasResponse.entry_gatekeeping.filter(e => e.decision === 'WAIT');

      console.log('[Atlas Entry] Analysis complete:', {
        globalStatus: atlasResponse.global_governor.status,
        approved: approved.length,
        blocked: blocked.length,
        waited: waited.length,
        total: atlasResponse.entry_gatekeeping.length,
        decisions: atlasResponse.entry_gatekeeping.map(e => `${e.candidate_id?.slice(0, 8)}: ${e.decision}`),
      });

      setState((s) => ({
        ...s,
        isAnalyzing: false,
        lastAnalysis: new Date(),
        lastResponse: atlasResponse,
        cycleCount: s.cycleCount + 1,
        approvedCount: s.approvedCount + approved.length,
        blockedCount: s.blockedCount + blocked.length,
        globalStatus: atlasResponse.global_governor.status,
      }));

      onAnalysisComplete?.(atlasResponse);

      // Notify for each approved entry
      for (const entry of approved) {
        onEntryApproved?.(entry.candidate_id, atlasResponse);
      }

      // Mark BLOCK'd and WAIT'd alerts as dismissed to prevent infinite re-analysis loops
      const toDismiss = [
        ...blocked.map(e => ({ id: e.candidate_id, reason: 'blocked_by_atlas' })),
        ...waited.map(e => ({ id: e.candidate_id, reason: 'wait_by_atlas' })),
      ];

      if (toDismiss.length > 0) {
        const supabase = getSupabaseBrowserClient();
        for (const item of toDismiss) {
          const { error: dismissError } = await supabase
            .from('agent_alerts')
            .update({
              status: 'dismissed' as const,
              action_taken: item.reason,
            })
            .eq('id', item.id);

          if (dismissError) {
            console.warn('[Atlas Entry] Failed to dismiss alert:', item.id, dismissError);
          }
        }
        console.log('[Atlas Entry] Dismissed', toDismiss.length, 'alerts (blocked + wait)');
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      const errorMessage = isAbortError
        ? 'Analysis timed out (120s)'
        : error instanceof Error ? error.message : 'Unknown error';
      console.error('[Atlas Entry] Analysis error:', errorMessage);
      setState((s) => ({
        ...s,
        isAnalyzing: false,
        error: errorMessage,
      }));
      onAnalysisError?.(error as Error);
    } finally {
      isAnalyzingRef.current = false;
    }
  }, [enabled, buildBundle, onAnalysisStart, onAnalysisComplete, onAnalysisError, onEntryApproved]);

  // ============================================================================
  // PERIODIC ANALYSIS
  // ============================================================================

  triggerAnalysisRef.current = triggerAnalysis;

  useEffect(() => {
    if (!enabled) {
      console.log('[Atlas Entry] ⚠️ Hook disabled, clearing timers');
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      return;
    }

    console.log('[Atlas Entry] 🚀 Setting up entry gatekeeping timer (interval:', analysisIntervalMs / 1000, 's)');
    console.log('[Atlas Entry] 📍 Component mounted at:', new Date().toISOString());

    // Initial analysis after a short delay
    const initialTimeout = setTimeout(() => {
      console.log('[Atlas Entry] ⏰ Initial analysis timer fired at:', new Date().toISOString());
      triggerAnalysisRef.current();
    }, 10000); // 10 seconds after mount

    // Periodic analysis
    analysisIntervalRef.current = setInterval(() => {
      console.log('[Atlas Entry] 🔄 Periodic analysis triggered at:', new Date().toISOString());
      triggerAnalysisRef.current();
    }, analysisIntervalMs);

    return () => {
      console.log('[Atlas Entry] 🧹 Cleanup called - clearing timers at:', new Date().toISOString());
      clearTimeout(initialTimeout);
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
    };
  }, [enabled, analysisIntervalMs]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    ...state,
    triggerAnalysis,
  };
}

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

    const { data: alerts, error } = await supabase
      .from('agent_alerts')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'new')
      .eq('decision', 'ALERT')
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
    return alerts.map((alert) => {
      const pattern = alert.pattern_json as Record<string, unknown>;
      const thesis = alert.thesis_json as Record<string, unknown>;
      const execution = alert.execution_json as Record<string, unknown> | null;

      return {
        candidate_id: alert.id,
        symbol: alert.symbol,
        setup: alert.setup as 'LONG' | 'SHORT',
        pattern_type: (pattern?.type as string) || 'UNKNOWN',
        confidence: Number(alert.confidence) || 0,
        entry_zone: {
          min: (execution?.entry_zone as { min?: number })?.min || 0,
          max: (execution?.entry_zone as { max?: number })?.max || 0,
          ideal: (execution?.entry_zone as { ideal?: number })?.ideal || 0,
        },
        stop_loss: typeof execution?.stop_loss === 'object'
          ? (execution.stop_loss as { price?: number }).price || 0
          : (execution?.stop_loss as number) || 0,
        take_profit: (execution?.take_profit as number) || 0,
        thesis_summary: (thesis?.summary as string) || (thesis?.title as string) || '',
        risk_notes: (alert.risk_notes as string[]) || [],
      };
    });
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

      const markPrice = parseFloat(asset.markPx || '0');
      const _oraclePrice = parseFloat(asset.oraclePx || asset.markPx || '0');

      return {
        hl_mid: markPrice,
        hl_bid: markPrice * 0.9999,
        hl_ask: markPrice * 1.0001,
        alpaca_mid: null, // Not available in this context
        alpaca_bid: null,
        alpaca_ask: null,
        drift_usd: 0,
        alpaca_spread_usd: null,
        funding_rate: parseFloat(asset.funding || '0'),
        open_interest: parseFloat(asset.openInterest || '0'),
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

  const buildBundle = useCallback(async (): Promise<AtlasEntryBundle | null> => {
    const [candidates, marketData, portfolioState] = await Promise.all([
      fetchPendingAlerts(),
      fetchMarketData(),
      fetchPortfolioState(),
    ]);

    if (!marketData) {
      console.log('[Atlas Entry] No market data available');
      return null;
    }

    if (candidates.length === 0) {
      console.log('[Atlas Entry] No pending alerts to analyze');
      return null;
    }

    // Build indicators (simplified for now)
    const indicators: AtlasIndicatorsInternal = {
      flush_score: 0,
      burst_score: 0,
      reclaim_flag: false,
      absorption_score: 0,
      whale_net_flow_usd: 0,
      whale_dominant_direction: 'neutral',
      support_levels: [],
      resistance_levels: [],
      atr_1m: null,
      atr_5m: null,
      chop_index: null,
      data_freshness_ms: 0,
      ws_connected: true,
    };

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
  }, [fetchPendingAlerts, fetchMarketData, fetchPortfolioState]);

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

      console.log('[Atlas Entry] Analysis complete:', {
        globalStatus: atlasResponse.global_governor.status,
        approved: atlasResponse.entry_gatekeeping.filter(e => e.decision === 'APPROVE_ENTRY').length,
        blocked: atlasResponse.entry_gatekeeping.filter(e => e.decision === 'BLOCK').length,
      });

      const approved = atlasResponse.entry_gatekeeping.filter(e => e.decision === 'APPROVE_ENTRY');
      const blocked = atlasResponse.entry_gatekeeping.filter(e => e.decision === 'BLOCK');

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

      // Mark BLOCK'd alerts as dismissed to prevent re-analysis loops
      if (blocked.length > 0) {
        const supabase = getSupabaseBrowserClient();
        const blockedIds = blocked.map(e => e.candidate_id);
        const { error: dismissError } = await supabase
          .from('agent_alerts')
          .update({
            status: 'dismissed' as const,
            action_taken: 'blocked_by_atlas',
          })
          .in('id', blockedIds);

        if (dismissError) {
          console.warn('[Atlas Entry] Failed to dismiss blocked alerts:', dismissError);
        } else {
          console.log('[Atlas Entry] Dismissed', blockedIds.length, 'blocked alerts');
        }
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

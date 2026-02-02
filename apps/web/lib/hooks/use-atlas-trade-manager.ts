'use client';

/**
 * Atlas Trade Manager Hook
 * Reviews open trades and proposes management actions (modify stop, close partial, etc.)
 * Runs every 10 minutes (configurable)
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';
import type {
  AtlasTradeBundle,
  AtlasTradeResponse,
  AtlasOpenTrade,
  AtlasOrderState,
  AtlasMarketRealtime,
  AtlasIndicatorsInternal,
  AtlasPortfolioState,
  AtlasGuardrails,
  AtlasTimeWindows,
  LiquidationMetrics,
  TradeAction,
} from '@kit/trading-core';

// ============================================================================
// TYPES
// ============================================================================

export interface UseAtlasTradeManagerOptions {
  /** Symbol to monitor (e.g., 'BTC') */
  symbol: string;
  /** Enable/disable the hook */
  enabled?: boolean;
  /** Analysis interval in milliseconds (default: 600000 = 10 minutes) */
  analysisIntervalMs?: number;
  /** Callback when analysis starts */
  onAnalysisStart?: () => void;
  /** Callback when analysis completes */
  onAnalysisComplete?: (result: AtlasTradeResponse) => void;
  /** Callback when analysis errors */
  onAnalysisError?: (error: Error) => void;
  /** Callback when an action is proposed */
  onActionProposed?: (tradeId: string, action: TradeAction) => void;
}

export interface AtlasTradeManagerState {
  isAnalyzing: boolean;
  lastAnalysis: Date | null;
  lastResponse: AtlasTradeResponse | null;
  cycleCount: number;
  actionsProposedTotal: number;
  openTradesCount: number;
  globalStatus: 'NORMAL' | 'CAUTION' | 'EMERGENCY' | null;
  error: string | null;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_ANALYSIS_INTERVAL = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useAtlasTradeManager(options: UseAtlasTradeManagerOptions) {
  const {
    symbol,
    enabled = true,
    analysisIntervalMs = DEFAULT_ANALYSIS_INTERVAL,
    onAnalysisStart,
    onAnalysisComplete,
    onAnalysisError,
    onActionProposed,
  } = options;

  const [state, setState] = useState<AtlasTradeManagerState>({
    isAnalyzing: false,
    lastAnalysis: null,
    lastResponse: null,
    cycleCount: 0,
    actionsProposedTotal: 0,
    openTradesCount: 0,
    globalStatus: null,
    error: null,
  });

  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef(false);
  const triggerAnalysisRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ============================================================================
  // FETCH OPEN TRADES
  // ============================================================================

  const fetchOpenTrades = useCallback(async (): Promise<AtlasOpenTrade[]> => {
    const supabase = getSupabaseBrowserClient();

    // Fetch real Binance orders instead of paper orders
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('symbol', `${symbol}USDT`) // Binance uses BTCUSDT format
      .eq('broker', 'binance')
      .in('status', ['new', 'partially_filled']) // Open statuses
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Atlas Trades] Error fetching open trades:', error);
      return [];
    }

    if (!orders || orders.length === 0) {
      console.log('[Atlas Trades] No open Binance trades found');
      return [];
    }

    console.log('[Atlas Trades] Found', orders.length, 'open Binance trades');

    // Fetch current price for PnL calculation
    let currentPrice = 0;
    try {
      const response = await fetch(`/api/trading/market-data?type=asset-contexts`);
      if (response.ok) {
        const allAssets = await response.json();
        const asset = allAssets.find((a: { coin: string }) => a.coin === symbol);
        if (asset) {
          currentPrice = parseFloat(asset.markPx || '0');
        }
      }
    } catch {
      console.error('[Atlas Trades] Failed to fetch current price');
    }

    // Convert Binance orders to AtlasOpenTrade format
    return orders.map((order) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderAny = order as any;

      // For Binance orders, we use filled_avg_price as entry (or limit_price if not filled yet)
      const entryPrice = Number(order.filled_avg_price) || Number(order.limit_price) || currentPrice;

      // Calculate size in USD from qty and price
      const qty = Number(order.qty) || 0;
      const sizeUsd = qty * entryPrice;

      // Binance orders don't have SL/TP embedded (they're separate orders)
      // For now, use default values - TODO: link to actual SL/TP orders
      const stopLoss = Number(order.stop_price) || 0;
      const takeProfit = 0; // Would need to fetch from separate order
      const originalSL = stopLoss;
      const originalTP = takeProfit;

      // Determine side from order side enum
      const side = (order.side as string).toUpperCase() === 'BUY' ? 'LONG' as const : 'SHORT' as const;

      // Calculate PnL
      const priceDiff = side === 'LONG'
        ? currentPrice - entryPrice
        : entryPrice - currentPrice;
      const unrealizedPnlUsd = (priceDiff / entryPrice) * sizeUsd;
      const unrealizedPnlPct = (priceDiff / entryPrice) * 100;

      // Calculate age in seconds
      const entryTime = new Date(order.filled_at || order.created_at);
      const ageSec = Math.floor((Date.now() - entryTime.getTime()) / 1000);

      return {
        trade_id: order.id,
        alert_id: order.intent_id, // Link to trade intent
        symbol: order.symbol.replace('USDT', ''), // Convert BTCUSDT -> BTC
        side,
        entry_price: entryPrice,
        entry_time: (order.filled_at || order.created_at) as string,
        size_usd: sizeUsd,
        current_price: currentPrice,
        unrealized_pnl_usd: unrealizedPnlUsd,
        unrealized_pnl_pct: unrealizedPnlPct,
        mfe_usd: Math.max(0, unrealizedPnlUsd), // TODO: Track actual MFE
        mae_usd: Math.min(0, unrealizedPnlUsd), // TODO: Track actual MAE
        age_sec: ageSec,
        last_review_ts: null, // TODO: Add review tracking
        review_count: 0, // TODO: Add review tracking
        risk_plan: {
          original_stop_loss: originalSL,
          original_take_profit: originalTP,
          current_stop_loss: stopLoss,
          current_take_profit: takeProfit,
          time_stop_sec: 3600, // 1 hour default
          invalidation_level: stopLoss,
          r_multiple_target: 2,
        },
        pattern_type: null,
        thesis_title: null,
      };
    });
  }, [symbol]);

  // ============================================================================
  // FETCH ORDERS STATE
  // ============================================================================

  const fetchOrdersState = useCallback(async (): Promise<AtlasOrderState[]> => {
    // For paper trading, we don't have separate stop/TP orders
    // They are embedded in the paper_order itself
    return [];
  }, []);

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
        alpaca_mid: null,
        alpaca_bid: null,
        alpaca_ask: null,
        drift_usd: 0,
        alpaca_spread_usd: null,
        funding_rate: parseFloat(asset.funding || '0'),
        open_interest: parseFloat(asset.openInterest || '0'),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[Atlas Trades] Error fetching market data:', error);
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
      console.error('[Atlas Trades] Error fetching portfolio state:', error);
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

  const buildBundle = useCallback(async (): Promise<AtlasTradeBundle | null> => {
    const [openTrades, ordersState, marketData, portfolioState] = await Promise.all([
      fetchOpenTrades(),
      fetchOrdersState(),
      fetchMarketData(),
      fetchPortfolioState(),
    ]);

    if (!marketData) {
      console.log('[Atlas Trades] No market data available');
      return null;
    }

    if (openTrades.length === 0) {
      console.log('[Atlas Trades] No open trades to manage');
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

    // Time windows config
    const timeWindows: AtlasTimeWindows = {
      review_interval_sec: 600, // 10 minutes
      entry_interval_sec: 300, // 5 minutes
      windows_sec: [600, 3600, 14400], // 10m, 1h, 4h
      hard_time_stop_default_sec: 3600, // 1 hour
      max_expected_trade_age_sec: 14400, // 4 hours
    };

    // Liquidation metrics (simplified - would need real data)
    const liquidationMetrics: LiquidationMetrics = {
      last_10m: { total_usd: null, longs_usd: null, shorts_usd: null },
      last_1h: { total_usd: null, longs_usd: null, shorts_usd: null },
      last_4h: { total_usd: null, longs_usd: null, shorts_usd: null },
      source: 'unknown',
    };

    return {
      now: Date.now(),
      market_realtime: marketData,
      indicators_internal: indicators,
      portfolio_state: portfolioState,
      open_trades: openTrades,
      orders_state: ordersState,
      guardrails,
      time_windows: timeWindows,
      liquidation_metrics: liquidationMetrics,
    };
  }, [fetchOpenTrades, fetchOrdersState, fetchMarketData, fetchPortfolioState]);

  // ============================================================================
  // TRIGGER ANALYSIS
  // ============================================================================

  const triggerAnalysis = useCallback(async () => {
    if (isAnalyzingRef.current || !enabled) return;

    console.log('[Atlas Trades] Starting trade management analysis...');

    const bundle = await buildBundle();
    if (!bundle) {
      console.log('[Atlas Trades] No bundle to analyze (no open trades or no market data)');
      return;
    }

    // Update open trades count
    setState((s) => ({ ...s, openTradesCount: bundle.open_trades.length }));

    console.log('[Atlas Trades] Bundle built:', {
      openTrades: bundle.open_trades.length,
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
      console.log('[Atlas Trades] Calling API...');
      const response = await fetch('/api/trading/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          action: 'atlas-trades',
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
      const atlasResponse = result.response as AtlasTradeResponse;

      console.log('[Atlas Trades] Analysis complete:', {
        globalStatus: atlasResponse.global_governor.status,
        tradesReviewed: atlasResponse.trade_management.length,
        totalActions: atlasResponse.trade_management.reduce((sum, tm) => sum + (tm.actions?.length || 0), 0),
      });

      const totalActions = atlasResponse.trade_management.reduce(
        (sum, tm) => sum + (tm.actions?.length || 0),
        0
      );

      setState((s) => ({
        ...s,
        isAnalyzing: false,
        lastAnalysis: new Date(),
        lastResponse: atlasResponse,
        cycleCount: s.cycleCount + 1,
        actionsProposedTotal: s.actionsProposedTotal + totalActions,
        globalStatus: atlasResponse.global_governor.status,
      }));

      onAnalysisComplete?.(atlasResponse);

      // Notify for each proposed action
      for (const tm of atlasResponse.trade_management) {
        if (tm.actions && tm.actions.length > 0) {
          for (const action of tm.actions) {
            onActionProposed?.(tm.trade_id, action);
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      const errorMessage = isAbortError
        ? 'Analysis timed out (120s)'
        : error instanceof Error ? error.message : 'Unknown error';
      console.error('[Atlas Trades] Analysis error:', errorMessage);
      setState((s) => ({
        ...s,
        isAnalyzing: false,
        error: errorMessage,
      }));
      onAnalysisError?.(error as Error);
    } finally {
      isAnalyzingRef.current = false;
    }
  }, [enabled, buildBundle, onAnalysisStart, onAnalysisComplete, onAnalysisError, onActionProposed]);

  // ============================================================================
  // PERIODIC ANALYSIS
  // ============================================================================

  triggerAnalysisRef.current = triggerAnalysis;

  useEffect(() => {
    if (!enabled) {
      console.log('[Atlas Trades] ⚠️ Hook disabled, clearing timers');
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      return;
    }

    console.log('[Atlas Trades] 🚀 Setting up trade management timer (interval:', analysisIntervalMs / 1000, 's)');
    console.log('[Atlas Trades] 📍 Component mounted at:', new Date().toISOString());

    // Initial analysis after a short delay
    const initialTimeout = setTimeout(() => {
      console.log('[Atlas Trades] ⏰ Initial analysis timer fired at:', new Date().toISOString());
      triggerAnalysisRef.current();
    }, 15000); // 15 seconds after mount (after entry gatekeeping)

    // Periodic analysis
    analysisIntervalRef.current = setInterval(() => {
      console.log('[Atlas Trades] 🔄 Periodic analysis triggered at:', new Date().toISOString());
      triggerAnalysisRef.current();
    }, analysisIntervalMs);

    return () => {
      console.log('[Atlas Trades] 🧹 Cleanup called - clearing timers at:', new Date().toISOString());
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

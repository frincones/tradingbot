'use client';

/**
 * Alert Collector Hook
 * Aggregates real-time market data and triggers Sentinel AI agent analysis
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import {
  useHyperliquidWS,
  type HLWSWhaleTrade,
  type HLWSActiveAssetData,
} from './use-hyperliquid-ws';
import type {
  RealtimeBundle,
  FlushEvent,
  BurstEvent,
  AbsorptionEvent,
  SentinelResponse,
} from '@kit/trading-core';

// ============================================================================
// TYPES
// ============================================================================

export interface UseAlertCollectorOptions {
  /** Symbol to monitor (e.g., 'BTC') */
  symbol: string;
  /** Enable/disable the collector */
  enabled?: boolean;
  /** Analysis interval in milliseconds (default: 30000 = 30 seconds) */
  analysisIntervalMs?: number;
  /** Minimum whale trade threshold in USD */
  whaleThresholdUsd?: number;
  /** Callback when analysis starts */
  onAnalysisStart?: () => void;
  /** Callback when analysis completes */
  onAnalysisComplete?: (result: SentinelResponse) => void;
  /** Callback when analysis errors */
  onAnalysisError?: (error: Error) => void;
  /** Callback when a new alert is generated */
  onNewAlert?: (alert: SentinelResponse) => void;
}

export interface AlertCollectorState {
  isConnected: boolean;
  isAnalyzing: boolean;
  lastAnalysis: Date | null;
  lastAlert: SentinelResponse | null;
  analysisCount: number;
  alertCount: number;
  error: string | null;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_ANALYSIS_INTERVAL = 30000; // 30 seconds
const DEFAULT_WHALE_THRESHOLD = 50000; // $50K
const MAX_WHALE_TRADES_BUFFER = 100;
const MAX_EVENTS_BUFFER = 20;

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useAlertCollector(options: UseAlertCollectorOptions) {
  const {
    symbol,
    enabled = true,
    analysisIntervalMs = DEFAULT_ANALYSIS_INTERVAL,
    whaleThresholdUsd = DEFAULT_WHALE_THRESHOLD,
    onAnalysisStart,
    onAnalysisComplete,
    onAnalysisError,
    onNewAlert,
  } = options;

  // State
  const [state, setState] = useState<AlertCollectorState>({
    isConnected: false,
    isAnalyzing: false,
    lastAnalysis: null,
    lastAlert: null,
    analysisCount: 0,
    alertCount: 0,
    error: null,
  });

  // Data accumulator refs (don't trigger re-renders)
  const whaleTrades = useRef<HLWSWhaleTrade[]>([]);
  const marketData = useRef<HLWSActiveAssetData | null>(null);
  const flushEvents = useRef<FlushEvent[]>([]);
  const burstEvents = useRef<BurstEvent[]>([]);
  const absorptionEvents = useRef<AbsorptionEvent[]>([]);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef(false);
  // Forward-declared ref for triggerAnalysis (set later when function is defined)
  const triggerAnalysisRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ============================================================================
  // WEBSOCKET HANDLERS
  // ============================================================================

  const handleWhaleTrade = useCallback(
    (trade: HLWSWhaleTrade) => {
      console.log('[Sentinel] 🐋 Whale trade callback:', trade.coin, '$' + trade.notionalUsd.toFixed(0), trade.side);
      if (trade.coin === symbol) {
        console.log('[Sentinel] ✅ Capturing whale trade for', symbol);
        whaleTrades.current = [
          trade,
          ...whaleTrades.current.slice(0, MAX_WHALE_TRADES_BUFFER - 1),
        ];

        // Simple flush detection based on large sells
        const isLargeTrade = trade.notionalUsd > whaleThresholdUsd * 2;
        console.log('[Sentinel] 📈 Event check:', {
          notional: trade.notionalUsd.toFixed(0),
          threshold: whaleThresholdUsd * 2,
          isLarge: isLargeTrade,
          side: trade.side,
        });

        if (isLargeTrade && trade.side !== 'B') {
          console.log('[Sentinel] 🔻 Creating FLUSH event for $' + trade.notionalUsd.toFixed(0));
          const flushEvent: FlushEvent = {
            type: 'flush',
            direction: 'short',
            price_level: parseFloat(trade.px),
            volume_spike: trade.notionalUsd,
            reclaim_detected: false,
            confidence: Math.min(trade.notionalUsd / (whaleThresholdUsd * 5), 1),
            timestamp: trade.time,
          };
          flushEvents.current = [
            flushEvent,
            ...flushEvents.current.slice(0, MAX_EVENTS_BUFFER - 1),
          ];
          console.log('[Sentinel] 📊 Flush events count:', flushEvents.current.length);
        }

        // Simple burst detection based on large buys
        if (isLargeTrade && trade.side === 'B') {
          console.log('[Sentinel] 🔺 Creating BURST event for $' + trade.notionalUsd.toFixed(0));
          const burstEvent: BurstEvent = {
            type: 'burst',
            direction: 'long',
            momentum: trade.notionalUsd / whaleThresholdUsd,
            price_change: 0,
            volume_ratio: trade.notionalUsd / whaleThresholdUsd,
            confidence: Math.min(trade.notionalUsd / (whaleThresholdUsd * 5), 1),
            timestamp: trade.time,
          };
          burstEvents.current = [
            burstEvent,
            ...burstEvents.current.slice(0, MAX_EVENTS_BUFFER - 1),
          ];
          console.log('[Sentinel] 📊 Burst events count:', burstEvents.current.length);
        }
      }
    },
    [symbol, whaleThresholdUsd]
  );

  const handleActiveAssetData = useCallback(
    (data: HLWSActiveAssetData) => {
      if (data.coin === symbol) {
        console.log('[Sentinel] 📊 Market data received for', symbol, {
          markPx: data.markPx,
          oraclePx: data.oraclePx,
          funding: data.funding,
        });
        marketData.current = data;
      }
    },
    [symbol]
  );

  // ============================================================================
  // WEBSOCKET CONNECTION
  // ============================================================================

  const { isConnected, subscribeTrades, subscribeActiveAssetData, unsubscribeTrades, unsubscribeActiveAssetData } =
    useHyperliquidWS({
      autoConnect: enabled,
      whaleThresholdUsd,
      onTrade: (trade) => {
        // Log ALL trades to verify the subscription is working
        const notional = parseFloat(trade.px) * parseFloat(trade.sz);
        if (trade.coin === symbol && notional > 1000) {
          console.log(`[Sentinel WS] Trade received: ${trade.coin} $${notional.toFixed(0)} (threshold: $${whaleThresholdUsd})`);
        }
      },
      onWhaleTrade: handleWhaleTrade,
      onActiveAssetData: handleActiveAssetData,
      onConnect: () => {
        console.log('[Sentinel] ✅ WebSocket connected (threshold: $' + whaleThresholdUsd + ')');
        setState((s) => ({ ...s, isConnected: true, error: null }));
      },
      onDisconnect: () => {
        console.log('[Sentinel] ❌ WebSocket disconnected');
        setState((s) => ({ ...s, isConnected: false }));
      },
    });

  // Subscribe to data streams
  useEffect(() => {
    if (isConnected && enabled) {
      console.log('[Sentinel] 📡 Subscribing to', symbol, 'data streams');
      subscribeTrades(symbol);
      subscribeActiveAssetData(symbol);

      // Trigger first analysis after 3 seconds to let data arrive
      const quickAnalysisTimer = setTimeout(() => {
        console.log('[Sentinel] 🔥 Quick analysis trigger (3s after subscribe)');
        triggerAnalysisRef.current();
      }, 3000);

      return () => {
        console.log('[Sentinel] 📴 Unsubscribing from', symbol, 'data streams');
        clearTimeout(quickAnalysisTimer);
        unsubscribeTrades(symbol);
        unsubscribeActiveAssetData(symbol);
      };
    }
  }, [isConnected, enabled, symbol, subscribeTrades, subscribeActiveAssetData, unsubscribeTrades, unsubscribeActiveAssetData]);

  // ============================================================================
  // BUILD REALTIME BUNDLE
  // ============================================================================

  const buildBundle = useCallback(async (): Promise<RealtimeBundle | null> => {
    // Try to use cached market data first, fallback to REST API
    let md = marketData.current;

    if (!md) {
      // Fetch market data from REST API as fallback
      console.log('[Sentinel] 🔄 Fetching market data via REST API for', symbol);
      try {
        const response = await fetch(`/api/trading/market-data?type=asset-contexts`);
        if (response.ok) {
          const allAssets = await response.json();
          const assetData = allAssets.find((a: { coin: string }) => a.coin === symbol);
          if (assetData) {
            md = assetData;
            marketData.current = assetData; // Cache it
            console.log('[Sentinel] ✅ Market data fetched via REST:', symbol, {
              markPx: assetData.markPx,
              oraclePx: assetData.oraclePx,
            });
          }
        }
      } catch (err) {
        console.error('[Sentinel] ❌ Failed to fetch market data:', err);
      }
    }

    if (!md) {
      console.log('[Sentinel] ⚠️ No market data available for', symbol);
      return null;
    }

    const trades = whaleTrades.current;

    // Calculate whale flow
    const buyingTotal = trades
      .filter((t) => t.side === 'B')
      .reduce((sum, t) => sum + t.notionalUsd, 0);
    const sellingTotal = trades
      .filter((t) => t.side !== 'B')
      .reduce((sum, t) => sum + t.notionalUsd, 0);
    const netFlow = buyingTotal - sellingTotal;

    // Fetch risk state from API
    let riskState = {
      daily_loss_usd: 0,
      daily_trades_count: 0,
      max_daily_loss_usd: 500,
      max_trades_per_day: 10,
      cooldown_active: false,
      cooldown_until: null,
      kill_switch_active: false,
      kill_switch_reason: null,
      current_position_value: 0,
      max_position_value: 10000,
    };

    try {
      const riskRes = await fetch('/api/trading/risk-state');
      if (riskRes.ok) {
        const data = await riskRes.json();
        riskState = { ...riskState, ...data };
      }
    } catch {
      // Use defaults
    }

    const markPrice = parseFloat(md.markPx || '0');
    const oraclePrice = parseFloat(md.oraclePx || md.markPx || '0');

    return {
      market_state: {
        symbol,
        current_price: markPrice,
        mark_price: markPrice,
        oracle_price: oraclePrice,
        funding_rate: parseFloat(md.funding || '0'),
        open_interest: parseFloat(md.openInterest || '0'),
        volume_24h: parseFloat(md.dayNtlVlm || '0'),
        bid_price: markPrice * 0.9999,
        ask_price: markPrice * 1.0001,
        spread_bps: 2,
        timestamp: Date.now(),
      },
      features: {
        flush_events: flushEvents.current,
        burst_events: burstEvents.current,
        absorption_events: absorptionEvents.current,
        recent_trades_count: trades.length,
        recent_volume_usd: trades.reduce((sum, t) => sum + t.notionalUsd, 0),
      },
      levels: {
        support_levels: [],
        resistance_levels: [],
        key_price_levels: [],
      },
      whales: {
        recent_trades: trades.map((t) => ({
          coin: t.coin,
          side: t.side === 'B' ? 'buy' as const : 'sell' as const,
          price: parseFloat(t.px),
          size: parseFloat(t.sz),
          notionalUsd: t.notionalUsd,
          hash: t.hash,
          time: t.time,
        })),
        large_positions_opened: [],
        total_whale_buying_usd: buyingTotal,
        total_whale_selling_usd: sellingTotal,
        net_whale_flow_usd: netFlow,
        dominant_direction:
          netFlow > whaleThresholdUsd
            ? 'buying'
            : netFlow < -whaleThresholdUsd
              ? 'selling'
              : 'neutral',
      },
      execution_context: {
        spread_bps: 2,
        liquidity_score: 0.8,
        slippage_estimate: 0.001,
        best_bid: markPrice * 0.9999,
        best_ask: markPrice * 1.0001,
        latency_estimate_ms: 200,
      },
      risk_state: {
        daily_loss_usd: riskState.daily_loss_usd,
        daily_trades_count: riskState.daily_trades_count,
        max_daily_loss_usd: riskState.max_daily_loss_usd,
        max_trades_per_day: riskState.max_trades_per_day,
        cooldown_active: riskState.cooldown_active,
        cooldown_until: riskState.cooldown_until,
        kill_switch_active: riskState.kill_switch_active,
        kill_switch_reason: riskState.kill_switch_reason,
        current_position_value: riskState.current_position_value,
        max_position_value: riskState.max_position_value,
      },
      config: {
        flush_threshold: 70,
        burst_threshold: 70,
        absorption_threshold: 60,
        whale_confirmation_required: true,
        min_confidence: 0.6,
        max_position_usd: 10000,
        max_daily_loss_usd: 500,
        max_trades_per_day: 10,
        cooldown_minutes: 30,
        paper_mode: true,
      },
    };
  }, [symbol, whaleThresholdUsd]);

  // ============================================================================
  // TRIGGER ANALYSIS
  // ============================================================================

  const triggerAnalysis = useCallback(async () => {
    if (isAnalyzingRef.current || !enabled) return;

    console.log('[Sentinel] 🔄 Starting analysis...');

    const bundle = await buildBundle();
    if (!bundle) {
      console.log('[Sentinel] ⚠️ No market data available yet');
      return;
    }

    console.log('[Sentinel] 📦 Bundle built:', {
      symbol: bundle.market_state.symbol,
      price: bundle.market_state.mark_price,
      whaleTrades: bundle.whales.recent_trades.length,
      netWhaleFlow: bundle.whales.net_whale_flow_usd,
      flushEvents: bundle.features.flush_events.length,
      burstEvents: bundle.features.burst_events.length,
    });

    isAnalyzingRef.current = true;
    setState((s) => ({ ...s, isAnalyzing: true, error: null }));
    onAnalysisStart?.();

    try {
      console.log('[Sentinel] 🤖 Calling AI agent API...');
      const response = await fetch('/api/trading/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: include cookies for authentication
        body: JSON.stringify({
          action: 'sentinel',
          data: { bundle },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Sentinel] ❌ API error:', response.status, errorText);
        throw new Error(`Analysis failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[Sentinel] ✅ Response:', {
        decision: result.response?.decision,
        confidence: result.response?.confidence,
        recommendation: result.response?.recommendation,
        pattern: result.response?.pattern?.type,
      });
      const sentinelResponse = result.response as SentinelResponse;

      setState((s) => ({
        ...s,
        isAnalyzing: false,
        lastAnalysis: new Date(),
        analysisCount: s.analysisCount + 1,
        lastAlert:
          sentinelResponse.decision === 'ALERT' ? sentinelResponse : s.lastAlert,
        alertCount:
          sentinelResponse.decision === 'ALERT'
            ? s.alertCount + 1
            : s.alertCount,
      }));

      onAnalysisComplete?.(sentinelResponse);

      if (sentinelResponse.decision === 'ALERT') {
        console.log('[Sentinel] 🚨 ALERT generated!', {
          pattern: sentinelResponse.pattern?.type,
          setup: sentinelResponse.pattern?.setup,
          confidence: sentinelResponse.confidence,
          recommendation: sentinelResponse.recommendation,
        });
        onNewAlert?.(sentinelResponse);
      } else {
        console.log('[Sentinel] 📊 No alert - decision:', sentinelResponse.decision);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('[Sentinel] ❌ Analysis error:', errorMessage);
      setState((s) => ({
        ...s,
        isAnalyzing: false,
        error: errorMessage,
      }));
      onAnalysisError?.(error as Error);
    } finally {
      isAnalyzingRef.current = false;
    }
  }, [
    enabled,
    buildBundle,
    onAnalysisStart,
    onAnalysisComplete,
    onAnalysisError,
    onNewAlert,
  ]);

  // ============================================================================
  // PERIODIC ANALYSIS
  // ============================================================================

  // Update the ref with the actual triggerAnalysis function
  triggerAnalysisRef.current = triggerAnalysis;

  useEffect(() => {
    if (!enabled || !isConnected) {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      return;
    }

    console.log('[Sentinel] 🚀 Setting up analysis timers (enabled:', enabled, 'connected:', isConnected, ')');

    // Initial analysis after a short delay to ensure market data arrives
    const initialTimeout = setTimeout(() => {
      console.log('[Sentinel] ⏰ Initial analysis timer fired, checking for market data...');
      if (marketData.current) {
        console.log('[Sentinel] ✅ Market data available, starting analysis');
        triggerAnalysisRef.current();
      } else {
        console.log('[Sentinel] ⏳ No market data yet, will retry in 5s');
        // Retry after another delay
        setTimeout(() => {
          if (marketData.current) {
            console.log('[Sentinel] ✅ Market data now available, starting analysis');
            triggerAnalysisRef.current();
          } else {
            console.log('[Sentinel] ❌ Still no market data after retry, forcing analysis anyway');
            triggerAnalysisRef.current(); // Try anyway - it will use REST API fallback
          }
        }, 5000);
      }
    }, 5000); // Reduced to 5s for faster initial feedback

    // Periodic analysis
    analysisIntervalRef.current = setInterval(() => {
      console.log('[Sentinel] ⏰ Periodic analysis triggered');
      triggerAnalysisRef.current();
    }, analysisIntervalMs);

    return () => {
      console.log('[Sentinel] 🧹 Cleaning up analysis timers');
      clearTimeout(initialTimeout);
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
    };
  }, [enabled, isConnected, analysisIntervalMs]);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    ...state,
    triggerAnalysis,
    whaleTrades: whaleTrades.current,
    clearEvents: () => {
      flushEvents.current = [];
      burstEvents.current = [];
      absorptionEvents.current = [];
    },
  };
}

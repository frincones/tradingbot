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
  RealtimeBundleV2,
  FlushEvent,
  BurstEvent,
  AbsorptionEvent,
  SentinelResponse,
  SentinelResponseV2,
  SentinelAlertV2,
  TimeframeContext,
  TimeframeSnapshot,
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

// Timeframe windows in milliseconds
const TIMEFRAME_10M_MS = 10 * 60 * 1000;
const TIMEFRAME_1H_MS = 60 * 60 * 1000;
const TIMEFRAME_4H_MS = 4 * 60 * 60 * 1000;

// Dynamic whale threshold config
const ATR_LOW_THRESHOLD = 0.5; // 0.5% ATR = quiet market
const ATR_HIGH_THRESHOLD = 1.5; // 1.5% ATR = volatile market
const WHALE_THRESHOLD_MULTIPLIER_LOW = 0.6; // $30K in quiet market
const WHALE_THRESHOLD_MULTIPLIER_HIGH = 2.0; // $100K in volatile market

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate dynamic whale threshold based on ATR
 */
function calculateDynamicWhaleThreshold(
  atrPercent: number,
  baseThreshold: number
): number {
  if (atrPercent < ATR_LOW_THRESHOLD) {
    return baseThreshold * WHALE_THRESHOLD_MULTIPLIER_LOW;
  } else if (atrPercent > ATR_HIGH_THRESHOLD) {
    return baseThreshold * WHALE_THRESHOLD_MULTIPLIER_HIGH;
  }
  return baseThreshold;
}

/**
 * Filter trades by timeframe window
 */
function filterTradesByTimeframe(
  trades: { time: number; notionalUsd: number; side: string }[],
  windowMs: number,
  now: number
): { time: number; notionalUsd: number; side: string }[] {
  const cutoff = now - windowMs;
  return trades.filter((t) => t.time >= cutoff);
}

/**
 * Filter events by timeframe window
 */
function filterEventsByTimeframe<T extends { timestamp: number }>(
  events: T[],
  windowMs: number,
  now: number
): T[] {
  const cutoff = now - windowMs;
  return events.filter((e) => e.timestamp >= cutoff);
}

/**
 * Calculate timeframe snapshot from trades and events
 */
function calculateTimeframeSnapshot(
  trades: { time: number; notionalUsd: number; side: string }[],
  flushEvents: FlushEvent[],
  burstEvents: BurstEvent[],
  absorptionEvents: AbsorptionEvent[],
  priceHistory: { time: number; price: number }[],
  windowMs: number,
  now: number
): TimeframeSnapshot {
  const filteredTrades = filterTradesByTimeframe(trades, windowMs, now);
  const filteredFlush = filterEventsByTimeframe(flushEvents, windowMs, now);
  const filteredBurst = filterEventsByTimeframe(burstEvents, windowMs, now);
  const filteredAbsorption = filterEventsByTimeframe(absorptionEvents, windowMs, now);

  const buying = filteredTrades
    .filter((t) => t.side === 'B')
    .reduce((sum, t) => sum + t.notionalUsd, 0);
  const selling = filteredTrades
    .filter((t) => t.side !== 'B')
    .reduce((sum, t) => sum + t.notionalUsd, 0);

  // Calculate price change and ATR from price history
  const cutoff = now - windowMs;
  const filteredPrices = priceHistory.filter((p) => p.time >= cutoff);
  let priceChangePct = 0;
  let volatilityAtr = 0;

  if (filteredPrices.length >= 2) {
    const firstPrice = filteredPrices[filteredPrices.length - 1]?.price || 0;
    const lastPrice = filteredPrices[0]?.price || firstPrice;
    if (firstPrice > 0) {
      priceChangePct = ((lastPrice - firstPrice) / firstPrice) * 100;
    }

    // Simple ATR approximation: average true range as % of price
    const highs = filteredPrices.map((p) => p.price);
    const lows = filteredPrices.map((p) => p.price);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const avgPrice = (high + low) / 2;
    if (avgPrice > 0) {
      volatilityAtr = ((high - low) / avgPrice) * 100;
    }
  }

  return {
    whale_net_flow_usd: buying - selling,
    flush_count: filteredFlush.length,
    burst_count: filteredBurst.length,
    absorption_count: filteredAbsorption.length,
    price_change_pct: priceChangePct,
    volume_usd: filteredTrades.reduce((sum, t) => sum + t.notionalUsd, 0),
    volatility_atr: volatilityAtr,
  };
}

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
  // Dedup: track processed trade hashes to avoid duplicates on WS reconnect
  const processedTradeHashes = useRef<Set<string>>(new Set());
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAnalyzingRef = useRef(false);
  // Forward-declared ref for triggerAnalysis (set later when function is defined)
  const triggerAnalysisRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // Price history for ATR calculation (max 4 hours of data)
  const priceHistory = useRef<{ time: number; price: number }[]>([]);
  const MAX_PRICE_HISTORY = 1000; // ~4 hours at 15s intervals

  // ============================================================================
  // WEBSOCKET HANDLERS
  // ============================================================================

  const handleWhaleTrade = useCallback(
    (trade: HLWSWhaleTrade) => {
      // Early return for non-target coins to reduce log spam
      if (trade.coin !== symbol) return;

      // Dedup: skip trades already processed (prevents duplicates on WS reconnect)
      if (processedTradeHashes.current.has(trade.hash)) {
        return;
      }
      processedTradeHashes.current.add(trade.hash);
      // Prevent memory leak: trim hash set when it grows too large
      if (processedTradeHashes.current.size > 500) {
        const entries = [...processedTradeHashes.current];
        processedTradeHashes.current = new Set(entries.slice(-250));
      }

      console.log('[Sentinel] 🐋 Whale trade:', trade.coin, '$' + trade.notionalUsd.toFixed(0), trade.side);
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

      // C3b: Reclaim detection - if a large buy occurs near a recent flush price, mark it as reclaimed
      if (isLargeTrade && trade.side === 'B') {
        const tradePrice = parseFloat(trade.px);
        flushEvents.current = flushEvents.current.map(f => {
          if (!f.reclaim_detected && Math.abs(f.price_level - tradePrice) / tradePrice < 0.005) {
            return { ...f, reclaim_detected: true };
          }
          return f;
        });
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

        // Record price for ATR calculation
        const price = parseFloat(data.markPx || '0');
        if (price > 0) {
          priceHistory.current = [
            { time: Date.now(), price },
            ...priceHistory.current.slice(0, MAX_PRICE_HISTORY - 1),
          ];
        }
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
  // BUILD REALTIME BUNDLE (V2 with multi-timeframe)
  // ============================================================================

  const buildBundle = useCallback(async (): Promise<RealtimeBundleV2 | null> => {
    // Try to use cached market data first, fallback to REST API
    let md = marketData.current;

    if (!md) {
      // Fetch market data from REST API as fallback
      // REST API returns ParsedAssetCtx format (markPrice, oraclePrice as numbers)
      // but buildBundle expects HLWSActiveAssetData format (markPx, oraclePx as strings)
      console.log('[Sentinel] 🔄 Fetching market data via REST API for', symbol);
      try {
        const response = await fetch(`/api/trading/market-data?type=asset-contexts`);
        if (response.ok) {
          const allAssets = await response.json();
          const assetData = allAssets.find((a: { coin: string }) => a.coin === symbol);
          if (assetData) {
            // Transform REST format (ParsedAssetCtx) to WS format (HLWSActiveAssetData)
            md = {
              coin: assetData.coin,
              markPx: String(assetData.markPrice ?? assetData.markPx ?? '0'),
              oraclePx: String(assetData.oraclePrice ?? assetData.oraclePx ?? '0'),
              funding: String(assetData.funding ?? '0'),
              openInterest: String(assetData.openInterest ?? '0'),
              dayNtlVlm: String(assetData.volume24h ?? assetData.dayNtlVlm ?? '0'),
              prevDayPx: String(assetData.prevDayPrice ?? assetData.prevDayPx ?? '0'),
            };
            marketData.current = md;
            console.log('[Sentinel] ✅ Market data fetched via REST:', symbol, {
              markPx: md.markPx,
              oraclePx: md.oraclePx,
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

    const now = Date.now();

    // C3a: Prune stale events older than 4h from buffers to prevent unbounded growth
    flushEvents.current = flushEvents.current.filter(e => e.timestamp >= now - TIMEFRAME_4H_MS);
    burstEvents.current = burstEvents.current.filter(e => e.timestamp >= now - TIMEFRAME_4H_MS);
    absorptionEvents.current = absorptionEvents.current.filter(e => e.timestamp >= now - TIMEFRAME_4H_MS);
    // Also prune stale whale trades (older than 4h)
    whaleTrades.current = whaleTrades.current.filter(t => t.time >= now - TIMEFRAME_4H_MS);

    const trades = whaleTrades.current;

    // Convert whale trades for timeframe calculation
    const tradesForTimeframe = trades.map((t) => ({
      time: t.time,
      notionalUsd: t.notionalUsd,
      side: t.side,
    }));

    // Calculate timeframe snapshots
    const tf_10m = calculateTimeframeSnapshot(
      tradesForTimeframe,
      flushEvents.current,
      burstEvents.current,
      absorptionEvents.current,
      priceHistory.current,
      TIMEFRAME_10M_MS,
      now
    );

    const tf_1h = calculateTimeframeSnapshot(
      tradesForTimeframe,
      flushEvents.current,
      burstEvents.current,
      absorptionEvents.current,
      priceHistory.current,
      TIMEFRAME_1H_MS,
      now
    );

    const tf_4h = calculateTimeframeSnapshot(
      tradesForTimeframe,
      flushEvents.current,
      burstEvents.current,
      absorptionEvents.current,
      priceHistory.current,
      TIMEFRAME_4H_MS,
      now
    );

    const timeframeContext: TimeframeContext = { tf_10m, tf_1h, tf_4h };

    // Use 1h ATR for dynamic threshold calculation
    const atrPercent = tf_1h.volatility_atr;
    const dynamicWhaleThreshold = calculateDynamicWhaleThreshold(
      atrPercent,
      whaleThresholdUsd
    );

    console.log('[Sentinel] 📊 Timeframe context:', {
      '10m_flow': tf_10m.whale_net_flow_usd.toFixed(0),
      '1h_flow': tf_1h.whale_net_flow_usd.toFixed(0),
      '4h_flow': tf_4h.whale_net_flow_usd.toFixed(0),
      atr_1h: atrPercent.toFixed(2) + '%',
      dynamic_threshold: dynamicWhaleThreshold.toFixed(0),
    });

    // Calculate whale flow (using all trades for backward compat)
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

    // Use dynamic threshold for dominant direction
    const effectiveThreshold = dynamicWhaleThreshold;

    return {
      // V2 specific fields
      timeframe_context: timeframeContext,
      dynamic_whale_threshold: dynamicWhaleThreshold,
      atr_percent: atrPercent,

      // Standard bundle fields
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
        timestamp: now,
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
          netFlow > effectiveThreshold
            ? 'buying'
            : netFlow < -effectiveThreshold
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
      console.log('[Sentinel] 🤖 Calling AI agent API (V2 dual analysis)...');
      const response = await fetch('/api/trading/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: include cookies for authentication
        body: JSON.stringify({
          action: 'sentinel-v2', // Use V2 with dual alert system
          data: { bundle },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Sentinel] ❌ API error:', response.status, errorText);
        throw new Error(`Analysis failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      // Handle V2 response with dual confidence scores
      const v2Response = result.response as SentinelResponseV2;
      console.log('[Sentinel] ✅ V2 Response:', {
        decision: v2Response?.decision,
        riskConfidence: v2Response?.risk_confidence,
        setupConfidence: v2Response?.setup_confidence,
        alertsCount: v2Response?.alerts?.length ?? 0,
        alertTypes: v2Response?.alerts?.map((a: SentinelAlertV2) => a.type) ?? [],
        recommendation: v2Response?.recommendation,
      });
      // For backward compatibility, use the V2 response as SentinelResponse
      const sentinelResponse = v2Response as SentinelResponse;

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
        // Log each alert type from V2 response
        const alerts = v2Response.alerts || [];
        for (const alert of alerts) {
          if (alert.type === 'RISK_ALERT') {
            console.log('[Sentinel] ⚠️ RISK_ALERT generated!', {
              riskType: alert.risk_type,
              riskLevel: alert.risk_level,
              confidence: alert.confidence,
              timeframe: alert.timeframe,
            });
          } else {
            console.log('[Sentinel] 🚨 TRADE_ALERT generated!', {
              pattern: alert.pattern?.type,
              setup: alert.pattern?.setup,
              confidence: alert.confidence,
              timeframe: alert.timeframe,
            });
          }
        }
        onNewAlert?.(sentinelResponse);
      } else {
        console.log('[Sentinel] 📊 No alert - decision:', sentinelResponse.decision, {
          riskConfidence: v2Response.risk_confidence,
          setupConfidence: v2Response.setup_confidence,
        });
        // C3c: After a non-alert analysis, prune events older than 10min
        // These events were analyzed and didn't warrant an alert, so clear them
        const tenMinAgo = Date.now() - TIMEFRAME_10M_MS;
        flushEvents.current = flushEvents.current.filter(e => e.timestamp >= tenMinAgo);
        burstEvents.current = burstEvents.current.filter(e => e.timestamp >= tenMinAgo);
        absorptionEvents.current = absorptionEvents.current.filter(e => e.timestamp >= tenMinAgo);
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

  // C5: Timers are decoupled from WebSocket connection state.
  // buildBundle() has a REST API fallback, so analysis can run even when WS is briefly disconnected.
  // This prevents the constant timer teardown/recreation cycle during rapid reconnections.
  useEffect(() => {
    if (!enabled) {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      return;
    }

    console.log('[Sentinel] 🚀 Setting up analysis timers (enabled:', enabled, ')');

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
          console.log('[Sentinel] ⏰ Retry analysis (will use REST fallback if no WS data)');
          triggerAnalysisRef.current();
        }, 5000);
      }
    }, 5000);

    // Periodic analysis - runs independently of WS connection
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
  }, [enabled, analysisIntervalMs]);

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

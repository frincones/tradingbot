'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Flame, Skull, TrendingUp, TrendingDown, Wifi, WifiOff, ExternalLink } from 'lucide-react';
import { useHyperliquidWS, type HLWSTrade } from '~/lib/hooks/use-hyperliquid-ws';

interface Liquidation {
  id: string;
  coin: string;
  side: 'long' | 'short';
  price: number;
  size: number;
  notionalUsd: number;
  time: number;
  hash: string;
}

interface Props {
  symbols?: string[];
}

const MAX_LIQUIDATIONS = 100;
const MIN_NOTIONAL_THRESHOLD = 25000; // $25K minimum for tracking

// Liquidation detection: Large market orders often indicate liquidations
// This is heuristic-based since Hyperliquid doesn't expose liquidation data directly
function detectPotentialLiquidation(
  trade: HLWSTrade,
  recentPrices: Map<string, number[]>
): { isLiquidation: boolean; confidence: 'high' | 'medium' | 'low' } {
  const price = parseFloat(trade.px);
  const size = parseFloat(trade.sz);
  const notional = price * size;

  // Only consider trades above threshold
  if (notional < MIN_NOTIONAL_THRESHOLD) {
    return { isLiquidation: false, confidence: 'low' };
  }

  // Get recent price history for this coin
  const prices = recentPrices.get(trade.coin) || [];
  prices.push(price);
  if (prices.length > 30) prices.shift();
  recentPrices.set(trade.coin, prices);

  // Very large trades are likely liquidations
  if (notional >= 500000) {
    return { isLiquidation: true, confidence: 'high' };
  }

  // Large trades with some price history
  if (notional >= 100000) {
    return { isLiquidation: true, confidence: 'medium' };
  }

  // Medium trades - check for rapid succession (multiple fills)
  if (notional >= MIN_NOTIONAL_THRESHOLD) {
    return { isLiquidation: true, confidence: 'low' };
  }

  return { isLiquidation: false, confidence: 'low' };
}

export function LiquidationFeed({ symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'DOGE', 'WIF'] }: Props) {
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [stats, setStats] = useState({ longLiquidations: 0, shortLiquidations: 0, totalValue: 0 });
  const recentPricesRef = useRef<Map<string, number[]>>(new Map());
  const tradeBufferRef = useRef<Map<string, HLWSTrade[]>>(new Map());

  // Process trades to detect potential liquidations
  const handleTrade = useCallback((trade: HLWSTrade) => {
    const price = parseFloat(trade.px);
    const size = parseFloat(trade.sz);
    const coin = trade.coin;
    const notionalUsd = price * size;

    // Detect if this could be a liquidation
    const detection = detectPotentialLiquidation(trade, recentPricesRef.current);

    if (detection.isLiquidation) {
      // Side determination: B (buy) = short getting liquidated, A/S (sell) = long getting liquidated
      const side = trade.side === 'B' ? 'short' : 'long';

      const liq: Liquidation = {
        id: `${trade.hash}-${trade.tid || Date.now()}`,
        coin,
        side,
        price,
        size,
        notionalUsd,
        time: trade.time,
        hash: trade.hash,
      };

      setLiquidations((prev) => {
        if (prev.some((l) => l.id === liq.id)) return prev;
        console.log(`[LiquidationFeed] Detected ${detection.confidence} confidence liquidation:`, coin, side, notionalUsd);
        return [liq, ...prev].slice(0, MAX_LIQUIDATIONS);
      });

      setStats((prev) => ({
        longLiquidations: prev.longLiquidations + (side === 'long' ? 1 : 0),
        shortLiquidations: prev.shortLiquidations + (side === 'short' ? 1 : 0),
        totalValue: prev.totalValue + notionalUsd,
      }));
    }
  }, []);

  const { isConnected, subscribeTrades } = useHyperliquidWS({
    autoConnect: true,
    onTrade: handleTrade,
  });

  // Subscribe to all symbol trades
  useEffect(() => {
    if (isConnected) {
      symbols.forEach((symbol) => subscribeTrades(symbol));
    }
  }, [isConnected, symbols, subscribeTrades]);

  // Reset stats periodically (every hour)
  useEffect(() => {
    const interval = setInterval(() => {
      setStats({ longLiquidations: 0, shortLiquidations: 0, totalValue: 0 });
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatNotional = (usd: number) => {
    if (usd >= 1000000) return `$${(usd / 1000000).toFixed(2)}M`;
    return `$${(usd / 1000).toFixed(0)}K`;
  };

  const getLiquidationIntensity = (notional: number) => {
    if (notional >= 500000) return 'animate-pulse border-l-4 border-l-orange-500';
    if (notional >= 250000) return 'border-l-4 border-l-yellow-500';
    if (notional >= 100000) return 'border-l-2 border-l-red-400';
    return '';
  };

  return (
    <Card className="h-full">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Flame className="h-4 w-4 text-orange-500" />
            Large Trades
            {isConnected ? (
              <Wifi className="h-3 w-3 text-green-500" />
            ) : (
              <WifiOff className="h-3 w-3 text-yellow-500" />
            )}
          </CardTitle>
          <Badge variant="destructive" className="text-xs">
            {formatNotional(stats.totalValue)} liquidated
          </Badge>
        </div>
        <div className="flex gap-2 pt-2">
          <Badge variant="outline" className="text-xs">
            <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
            {stats.longLiquidations} Longs
          </Badge>
          <Badge variant="outline" className="text-xs">
            <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
            {stats.shortLiquidations} Shorts
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          {liquidations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <Skull className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Waiting for liquidations...</p>
              <p className="text-xs">Monitoring {symbols.length} pairs</p>
            </div>
          ) : (
            <div className="divide-y">
              {liquidations.map((liq) => (
                <div
                  key={liq.id}
                  className={`flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors ${getLiquidationIntensity(liq.notionalUsd)}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-1 rounded ${
                        liq.side === 'long' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}
                    >
                      {liq.side === 'long' ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm">{liq.coin}</span>
                        <Badge
                          variant={liq.side === 'long' ? 'default' : 'destructive'}
                          className="text-[10px] px-1 py-0"
                        >
                          {liq.side.toUpperCase()} REKT
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        @ ${liq.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-sm text-orange-500">
                      {formatNotional(liq.notionalUsd)}
                    </p>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground">{formatTime(liq.time)}</span>
                      <a
                        href={`https://hyperliquid.xyz/explorer/tx/${liq.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

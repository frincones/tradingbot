'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@kit/ui/select';
import { Fish, TrendingUp, TrendingDown, Wifi, WifiOff, ExternalLink } from 'lucide-react';
import { useHyperliquidWS, type HLWSWhaleTrade } from '~/lib/hooks/use-hyperliquid-ws';

interface WhaleTrade {
  id: string;
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  notionalUsd: number;
  time: number;
  hash: string;
}

interface Props {
  symbols?: string[];
  initialThreshold?: number;
}

const MAX_TRADES = 50;

export function WhaleTrades({ symbols = ['BTC', 'ETH', 'SOL'], initialThreshold = 25000 }: Props) {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [threshold, setThreshold] = useState(initialThreshold);
  const tradeCountRef = useRef(0);
  const fetchedRef = useRef(false);

  // Handle whale trade from WebSocket
  const handleWhaleTrade = useCallback((trade: HLWSWhaleTrade) => {
    const newTrade: WhaleTrade = {
      id: `${trade.hash}-${trade.tid || Date.now()}`,
      coin: trade.coin,
      side: trade.side === 'B' ? 'buy' : 'sell',
      price: parseFloat(trade.px),
      size: parseFloat(trade.sz),
      notionalUsd: trade.notionalUsd,
      time: trade.time,
      hash: trade.hash,
    };

    setTrades((prev) => {
      // Prevent duplicates
      if (prev.some((t) => t.id === newTrade.id)) {
        return prev;
      }
      tradeCountRef.current++;
      const updated = [newTrade, ...prev];
      return updated.slice(0, MAX_TRADES);
    });
  }, []);

  const { isConnected, subscribeTrades } = useHyperliquidWS({
    autoConnect: true,
    whaleThresholdUsd: threshold,
    onWhaleTrade: handleWhaleTrade,
  });

  // Subscribe to trades for all symbols
  useEffect(() => {
    if (isConnected) {
      symbols.forEach((symbol) => subscribeTrades(symbol));
    }
  }, [isConnected, symbols, subscribeTrades]);

  // Fetch initial whale trades from REST API
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchInitialTrades() {
      console.log('[WhaleTrades] Fetching initial trades for:', symbols);
      try {
        const allTrades: WhaleTrade[] = [];

        for (const symbol of symbols) {
          // Use a lower threshold for initial fetch to get some data
          const fetchThreshold = Math.min(threshold, 10000);
          const response = await fetch(
            `/api/trading/market-data?type=whale-trades&coin=${symbol}&threshold=${fetchThreshold}`
          );
          if (response.ok) {
            const data = await response.json();
            console.log(`[WhaleTrades] Got ${data.length} trades for ${symbol}`);

            const newTrades: WhaleTrade[] = data.map(
              (t: { coin: string; side: string; price: number; size: number; notionalUsd: number; time: number; hash: string }) => ({
                id: `${t.hash}-init`,
                coin: t.coin || symbol,
                side: t.side as 'buy' | 'sell',
                price: t.price,
                size: t.size,
                notionalUsd: t.notionalUsd,
                time: t.time,
                hash: t.hash,
              })
            );
            allTrades.push(...newTrades);
          }
        }

        if (allTrades.length > 0) {
          // Filter by current threshold and remove duplicates
          const filtered = allTrades
            .filter((t) => t.notionalUsd >= threshold)
            .filter((trade, idx, arr) => arr.findIndex((t) => t.hash === trade.hash) === idx)
            .sort((a, b) => b.time - a.time)
            .slice(0, MAX_TRADES);

          console.log(`[WhaleTrades] Setting ${filtered.length} trades after filtering`);
          setTrades(filtered);
        }
      } catch (err) {
        console.error('Failed to fetch initial whale trades:', err);
      }
    }

    fetchInitialTrades();
  }, [symbols, threshold]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatNotional = (usd: number) => {
    if (usd >= 1000000) return `$${(usd / 1000000).toFixed(2)}M`;
    return `$${(usd / 1000).toFixed(0)}K`;
  };

  const getTradeIntensity = (notional: number) => {
    if (notional >= 1000000) return 'bg-purple-500/20 border-purple-500';
    if (notional >= 500000) return 'bg-orange-500/20 border-orange-500';
    if (notional >= 250000) return 'bg-yellow-500/20 border-yellow-500';
    return '';
  };

  return (
    <Card className="h-full">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Fish className="h-4 w-4" />
            Whale Trades
            {isConnected ? (
              <Wifi className="h-3 w-3 text-green-500" />
            ) : (
              <WifiOff className="h-3 w-3 text-yellow-500" />
            )}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {trades.length} trades
          </Badge>
        </div>
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Min Size</span>
          </div>
          <Select
            value={String(threshold)}
            onValueChange={(v) => {
              setThreshold(parseInt(v, 10));
              fetchedRef.current = false; // Allow re-fetch with new threshold
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Select threshold" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5000">$5K</SelectItem>
              <SelectItem value="10000">$10K</SelectItem>
              <SelectItem value="25000">$25K</SelectItem>
              <SelectItem value="50000">$50K</SelectItem>
              <SelectItem value="100000">$100K</SelectItem>
              <SelectItem value="250000">$250K</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          {trades.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              Watching for whale trades &gt;{formatNotional(threshold)}...
            </div>
          ) : (
            <div className="divide-y">
              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className={`flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors ${getTradeIntensity(trade.notionalUsd)}`}
                >
                  <div className="flex items-center gap-2">
                    {trade.side === 'buy' ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm">{trade.coin}</span>
                        <Badge
                          variant={trade.side === 'buy' ? 'default' : 'destructive'}
                          className="text-[10px] px-1 py-0"
                        >
                          {trade.side.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {trade.size.toFixed(4)} @ ${trade.price.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-mono font-bold text-sm ${
                        trade.side === 'buy' ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {formatNotional(trade.notionalUsd)}
                    </p>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-muted-foreground">{formatTime(trade.time)}</span>
                      <a
                        href={`https://hyperliquid.xyz/explorer/tx/${trade.hash}`}
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

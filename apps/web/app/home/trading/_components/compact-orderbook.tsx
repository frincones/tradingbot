'use client';

/**
 * Compact Order Book - Hyperliquid Style
 * Ultra-dense display with depth visualization
 */

import { useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Wifi, WifiOff } from 'lucide-react';
import { useHyperliquidWS, type HLWSOrderBook } from '~/lib/hooks/use-hyperliquid-ws';

interface OrderBookEntry {
  price: number;
  size: number;
  total: number;
}

interface Props {
  symbol: string;
  levels?: number;
}

export function CompactOrderBook({ symbol, levels = 15 }: Props) {
  const [bids, setBids] = useState<OrderBookEntry[]>([]);
  const [asks, setAsks] = useState<OrderBookEntry[]>([]);
  const [spread, setSpread] = useState({ value: 0, percent: 0 });

  const processOrderBook = useCallback((data: HLWSOrderBook) => {
    if (data.coin !== symbol) return;

    const processLevels = (levelData: Array<{ px: string; sz: string }> | undefined) => {
      if (!levelData) return [];
      let cumulative = 0;
      return levelData.slice(0, levels).map((entry) => {
        const price = parseFloat(entry.px);
        const size = parseFloat(entry.sz);
        cumulative += size;
        return { price, size, total: cumulative };
      });
    };

    const newBids = processLevels(data.levels?.[0] as Array<{ px: string; sz: string }>);
    const newAsks = processLevels(data.levels?.[1] as Array<{ px: string; sz: string }>);

    setBids(newBids);
    setAsks(newAsks.reverse());

    if (newBids.length > 0 && newAsks.length > 0) {
      const bestBid = newBids[0]?.price || 0;
      const bestAsk = newAsks[newAsks.length - 1]?.price || 0;
      const spreadVal = bestAsk - bestBid;
      setSpread({
        value: spreadVal,
        percent: bestBid > 0 ? (spreadVal / bestBid) * 100 : 0,
      });
    }
  }, [symbol, levels]);

  const { isConnected, subscribeOrderBook } = useHyperliquidWS({
    autoConnect: true,
    onOrderBook: processOrderBook,
  });

  useEffect(() => {
    if (isConnected) {
      subscribeOrderBook(symbol);
    }
  }, [isConnected, symbol, subscribeOrderBook]);

  // Fetch initial data
  useEffect(() => {
    async function fetchOrderBook() {
      try {
        const response = await fetch(`/api/trading/market-data?type=orderbook&coin=${symbol}`);
        if (response.ok) {
          const data = await response.json();
          let cumBid = 0;
          let cumAsk = 0;

          const newBids = (data.bids || []).slice(0, levels).map((b: { price: number; size: number }) => {
            cumBid += b.size;
            return { price: b.price, size: b.size, total: cumBid };
          });

          const newAsks = (data.asks || []).slice(0, levels).map((a: { price: number; size: number }) => {
            cumAsk += a.size;
            return { price: a.price, size: a.size, total: cumAsk };
          });

          setBids(newBids);
          setAsks(newAsks.reverse());

          if (newBids.length > 0 && newAsks.length > 0) {
            const bestBid = newBids[0]?.price || 0;
            const bestAsk = newAsks[newAsks.length - 1]?.price || 0;
            const spreadVal = bestAsk - bestBid;
            setSpread({
              value: spreadVal,
              percent: bestBid > 0 ? (spreadVal / bestBid) * 100 : 0,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch order book:', err);
      }
    }

    fetchOrderBook();
  }, [symbol, levels]);

  const maxTotal = Math.max(
    ...bids.map((b) => b.total),
    ...asks.map((a) => a.total),
    1
  );

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(6);
  };

  const formatSize = (size: number) => {
    if (size >= 1) return size.toFixed(4);
    return size.toFixed(6);
  };

  const midPrice = ((bids[0]?.price || 0) + (asks[asks.length - 1]?.price || 0)) / 2;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - ultra compact */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/20 shrink-0">
        <span className="text-[11px] font-medium">Order Book</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-muted-foreground font-mono">
            {spread.percent.toFixed(3)}%
          </span>
          {isConnected ? (
            <Wifi className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <WifiOff className="h-2.5 w-2.5 text-yellow-500" />
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 px-1.5 py-0.5 text-[9px] text-muted-foreground border-b shrink-0">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (sells) - scrollable */}
      <div className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1">
          <div className="flex flex-col justify-end min-h-full">
            {asks.map((ask, idx) => (
              <div
                key={`ask-${idx}`}
                className="relative grid grid-cols-3 px-1.5 py-px text-[10px] font-mono hover:bg-red-500/5"
              >
                <div
                  className="absolute inset-0 bg-red-500/10"
                  style={{ width: `${(ask.total / maxTotal) * 100}%`, right: 0, left: 'auto' }}
                />
                <span className="relative text-red-500">{formatPrice(ask.price)}</span>
                <span className="relative text-right tabular-nums text-foreground/70">{formatSize(ask.size)}</span>
                <span className="relative text-right text-muted-foreground/60 tabular-nums">
                  {formatSize(ask.total)}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Mid price / Spread - centered */}
        <div className="flex items-center justify-center py-1 border-y bg-muted/30 shrink-0">
          <span className="text-xs font-mono font-bold tabular-nums">
            {formatPrice(midPrice)}
          </span>
          <span className="ml-2 text-[9px] text-muted-foreground">
            ${(midPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        </div>

        {/* Bids (buys) - scrollable */}
        <ScrollArea className="flex-1">
          <div>
            {bids.map((bid, idx) => (
              <div
                key={`bid-${idx}`}
                className="relative grid grid-cols-3 px-1.5 py-px text-[10px] font-mono hover:bg-green-500/5"
              >
                <div
                  className="absolute inset-0 bg-green-500/10"
                  style={{ width: `${(bid.total / maxTotal) * 100}%`, right: 0, left: 'auto' }}
                />
                <span className="relative text-green-500">{formatPrice(bid.price)}</span>
                <span className="relative text-right tabular-nums text-foreground/70">{formatSize(bid.size)}</span>
                <span className="relative text-right text-muted-foreground/60 tabular-nums">
                  {formatSize(bid.total)}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

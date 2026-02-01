'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { BookOpen, Wifi, WifiOff } from 'lucide-react';
import { useHyperliquidWS, type HLWSOrderBook } from '~/lib/hooks/use-hyperliquid-ws';

interface OrderBookEntry {
  price: number;
  size: number;
  total: number;
}

interface OrderBookData {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  spreadPercent: number;
}

interface Props {
  symbol?: string;
}

function parseOrderBookLevels(levels: Array<{ px: string; sz: string; n?: number }> | undefined): OrderBookEntry[] {
  if (!levels || !Array.isArray(levels)) return [];

  return levels.slice(0, 15).map((entry, idx, arr) => {
    const price = parseFloat(String(entry.px));
    const size = parseFloat(String(entry.sz));
    const previousTotal = idx > 0
      ? arr.slice(0, idx).reduce((sum, e) => sum + parseFloat(String(e.sz)), 0)
      : 0;
    return {
      price,
      size,
      total: previousTotal + size,
    };
  });
}

export function OrderBook({ symbol = 'BTC' }: Props) {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeUpdates, setRealtimeUpdates] = useState(0);

  // Process order book data from either REST API or WebSocket
  const processOrderBookData = useCallback((data: { bids?: unknown[]; asks?: unknown[]; levels?: unknown[][] }) => {
    let bids: OrderBookEntry[] = [];
    let asks: OrderBookEntry[] = [];

    // Handle levels array format from WebSocket
    if (data.levels && Array.isArray(data.levels)) {
      const levels = data.levels as Array<Array<{ px: string; sz: string; n?: number }>>;
      bids = parseOrderBookLevels(levels[0]);
      asks = parseOrderBookLevels(levels[1]);
    }
    // Handle bids/asks object format from REST API
    else if (data.bids || data.asks) {
      bids = (data.bids || []).slice(0, 15).map((entry: unknown, idx: number, arr: unknown[]) => {
        const e = entry as { price?: number; size?: number; px?: string; sz?: string };
        const price = e.price ?? parseFloat(String(e.px ?? 0));
        const size = e.size ?? parseFloat(String(e.sz ?? 0));
        const previousTotal = idx > 0
          ? arr.slice(0, idx).reduce((sum: number, prev: unknown) => {
            const p = prev as { price?: number; size?: number; px?: string; sz?: string };
            return sum + (p.size ?? parseFloat(String(p.sz ?? 0)));
          }, 0)
          : 0;
        return { price, size, total: previousTotal + size };
      });

      asks = (data.asks || []).slice(0, 15).map((entry: unknown, idx: number, arr: unknown[]) => {
        const e = entry as { price?: number; size?: number; px?: string; sz?: string };
        const price = e.price ?? parseFloat(String(e.px ?? 0));
        const size = e.size ?? parseFloat(String(e.sz ?? 0));
        const previousTotal = idx > 0
          ? arr.slice(0, idx).reduce((sum: number, prev: unknown) => {
            const p = prev as { price?: number; size?: number; px?: string; sz?: string };
            return sum + (p.size ?? parseFloat(String(p.sz ?? 0)));
          }, 0)
          : 0;
        return { price, size, total: previousTotal + size };
      });
    }

    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    setOrderBook({ bids, asks: asks.reverse(), spread, spreadPercent });
    setLoading(false);
  }, []);

  // Hyperliquid WebSocket for realtime updates
  const {
    isConnected,
    subscribeOrderBook,
  } = useHyperliquidWS({
    autoConnect: true,
    onOrderBook: useCallback((book: HLWSOrderBook) => {
      // Only process order book for the current symbol
      if (book.coin !== symbol) {
        return;
      }

      processOrderBookData({ levels: book.levels as unknown[][] });
      setRealtimeUpdates((prev) => prev + 1);
    }, [symbol, processOrderBookData]),
  });

  // Subscribe to WebSocket when symbol changes
  useEffect(() => {
    if (isConnected) {
      subscribeOrderBook(symbol);
    }
  }, [isConnected, symbol, subscribeOrderBook]);

  // Initial fetch via REST API
  const fetchOrderBook = useCallback(async () => {
    try {
      const response = await fetch(`/api/trading/market-data?type=orderbook&coin=${symbol}`);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      processOrderBookData(data);
    } catch (err) {
      console.error('Failed to fetch order book:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, processOrderBookData]);

  // Fetch initial data
  useEffect(() => {
    fetchOrderBook();
  }, [fetchOrderBook]);

  const formatPrice = (price: number) =>
    price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: price < 1 ? 6 : 2,
    });

  const formatSize = (size: number) =>
    size < 1 ? size.toFixed(4) : size.toFixed(2);

  if (loading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4" />
            Order Book
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="animate-pulse space-y-1 p-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-5 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!orderBook) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4" />
            Order Book
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load order book</p>
        </CardContent>
      </Card>
    );
  }

  const maxTotal = Math.max(
    ...orderBook.bids.map((b) => b.total),
    ...orderBook.asks.map((a) => a.total),
    1 // Prevent division by zero
  );

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4" />
            {symbol}/USD
            {isConnected ? (
              <Wifi className="h-3 w-3 text-green-500" />
            ) : (
              <WifiOff className="h-3 w-3 text-yellow-500" />
            )}
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            Spread: {formatPrice(orderBook.spread)} ({orderBook.spreadPercent.toFixed(3)}%)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Header */}
        <div className="grid grid-cols-3 text-xs text-muted-foreground px-3 py-1 border-b">
          <span>Price (USD)</span>
          <span className="text-right">Size ({symbol})</span>
          <span className="text-right">Total</span>
        </div>

        {/* Asks (sells) - shown in reverse so lowest ask is at bottom */}
        <div className="space-y-0">
          {orderBook.asks.map((ask, idx) => (
            <div
              key={`ask-${idx}`}
              className="relative grid grid-cols-3 text-xs px-3 py-0.5 hover:bg-red-500/10"
            >
              <div
                className="absolute inset-0 bg-red-500/10"
                style={{ width: `${(ask.total / maxTotal) * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="relative z-10 text-red-500 font-mono tabular-nums">{formatPrice(ask.price)}</span>
              <span className="relative z-10 text-right font-mono tabular-nums">{formatSize(ask.size)}</span>
              <span className="relative z-10 text-right font-mono text-muted-foreground tabular-nums">
                {formatSize(ask.total)}
              </span>
            </div>
          ))}
        </div>

        {/* Spread indicator / Mid price */}
        <div className="flex items-center justify-center py-2 border-y bg-muted/30">
          <span className="text-lg font-mono font-bold tabular-nums">
            {formatPrice(((orderBook.bids[0]?.price || 0) + (orderBook.asks[orderBook.asks.length - 1]?.price || 0)) / 2)}
          </span>
        </div>

        {/* Bids (buys) */}
        <div className="space-y-0">
          {orderBook.bids.map((bid, idx) => (
            <div
              key={`bid-${idx}`}
              className="relative grid grid-cols-3 text-xs px-3 py-0.5 hover:bg-green-500/10"
            >
              <div
                className="absolute inset-0 bg-green-500/10"
                style={{ width: `${(bid.total / maxTotal) * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="relative z-10 text-green-500 font-mono tabular-nums">{formatPrice(bid.price)}</span>
              <span className="relative z-10 text-right font-mono tabular-nums">{formatSize(bid.size)}</span>
              <span className="relative z-10 text-right font-mono text-muted-foreground tabular-nums">
                {formatSize(bid.total)}
              </span>
            </div>
          ))}
        </div>

        {/* Update counter */}
        {realtimeUpdates > 0 && (
          <div className="px-3 py-1 text-xs text-muted-foreground border-t">
            {realtimeUpdates} realtime updates
          </div>
        )}
      </CardContent>
    </Card>
  );
}

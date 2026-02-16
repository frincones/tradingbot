'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';
import { X, ArrowUpRight, ArrowDownRight, Inbox } from 'lucide-react';

interface Position {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  avg_entry_price: number | null;
  current_price: number | null;
  unrealized_pnl: number | null;
  is_open: boolean;
  strategy_id: string;
  created_at: string;
}

interface Props {
  currentPrices?: Record<string, number>;
}

export function OpenPositions({ currentPrices }: Props) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPositions() {
      try {
        const response = await fetch('/api/trading/positions?openOnly=true');
        if (response.ok) {
          const data = await response.json();
          setPositions(data);
        }
      } catch (err) {
        console.error('Failed to fetch positions:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchPositions();
    const interval = setInterval(fetchPositions, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClosePosition = async (positionId: string, symbol: string) => {
    if (!confirm('Are you sure you want to close this position?')) return;

    try {
      const response = await fetch(`/api/trading/positions?id=${positionId}&symbol=${symbol}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setPositions((prev) => prev.filter((p) => p.id !== positionId));
      }
    } catch (err) {
      console.error('Failed to close position:', err);
    }
  };

  // Compute live P&L using currentPrices from WebSocket (prioritize live data)
  const computePnl = (position: Position): number => {
    const entryPrice = position.avg_entry_price || 0;
    if (entryPrice === 0) return position.unrealized_pnl ?? 0;
    // Try to get live price from WS data (symbol format: BTCUSDT -> BTC)
    const baseSymbol = position.symbol.replace('USDT', '').replace('/USD', '');
    const livePrice = currentPrices?.[baseSymbol];
    if (livePrice && livePrice > 0) {
      const priceDiff = position.side === 'buy' ? livePrice - entryPrice : entryPrice - livePrice;
      return priceDiff * position.qty;
    }
    // Fallback to DB values when no live price available
    if (position.unrealized_pnl != null) return position.unrealized_pnl;
    const fallbackPrice = position.current_price || 0;
    if (fallbackPrice === 0) return 0;
    const priceDiff = position.side === 'buy' ? fallbackPrice - entryPrice : entryPrice - fallbackPrice;
    return priceDiff * position.qty;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Inbox className="h-8 w-8 mb-1 opacity-50" />
        <p className="text-xs">No open positions</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_0.5fr_0.8fr_0.7fr_0.7fr_0.4fr] gap-2 px-2 py-1 text-[10px] text-muted-foreground border-b sticky top-0 bg-background">
        <span>Symbol</span>
        <span>Side</span>
        <span className="text-right">Size/Entry</span>
        <span className="text-right">Mark</span>
        <span className="text-right">P&L</span>
        <span></span>
      </div>

      {/* Positions rows */}
      <div className="divide-y divide-border/50">
        {positions.map((position) => {
          const pnl = computePnl(position);
          const isProfit = pnl >= 0;
          const entryPrice = position.avg_entry_price || 0;
          const baseSymbol = position.symbol.replace('USDT', '').replace('/USD', '');
          const livePrice = currentPrices?.[baseSymbol] || position.current_price || 0;

          return (
            <div
              key={position.id}
              className="grid grid-cols-[1fr_0.5fr_0.8fr_0.7fr_0.7fr_0.4fr] gap-2 px-2 py-1 items-center text-[11px] hover:bg-muted/30"
            >
              <div className="flex items-center gap-1.5">
                {position.side === 'buy' ? (
                  <ArrowUpRight className="h-3 w-3 text-green-500" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-red-500" />
                )}
                <span className="font-medium">{position.symbol}</span>
              </div>
              <Badge
                variant={position.side === 'buy' ? 'default' : 'destructive'}
                className="text-[9px] px-1 py-0 h-4 w-fit"
              >
                {position.side === 'buy' ? 'LONG' : 'SHORT'}
              </Badge>
              <div className="text-right font-mono text-muted-foreground">
                <span>{position.qty}</span>
                {entryPrice > 0 && (
                  <span className="text-[9px] ml-1">@${entryPrice.toFixed(2)}</span>
                )}
              </div>
              <div className="text-right font-mono text-muted-foreground">
                {livePrice > 0 ? `$${livePrice.toFixed(2)}` : '-'}
              </div>
              <div className={`text-right font-mono font-medium ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                {isProfit ? '+' : ''}${pnl.toFixed(2)}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => handleClosePosition(position.id, position.symbol)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

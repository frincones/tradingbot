'use client';

/**
 * Trade Feed Component - Hyperliquid Style
 * Shows ALL trades in realtime without filtering
 * Sorted by notional value (largest first) to identify whales
 * Ultra-compact, dense information display with copy functionality
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Wifi, WifiOff, Copy, Check, ExternalLink } from 'lucide-react';
import { useHyperliquidWS, type HLWSTrade } from '~/lib/hooks/use-hyperliquid-ws';

interface Trade {
  id: string;
  price: number;
  size: number;
  notional: number;
  side: 'buy' | 'sell';
  time: number;
  hash: string;
}

interface Props {
  symbol: string;
  maxTrades?: number;
  sortBySize?: boolean;
}

const MAX_TRADES_DEFAULT = 100;

export function TradeFeed({ symbol, maxTrades = MAX_TRADES_DEFAULT, sortBySize = true }: Props) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const tradeIdRef = useRef(0);

  // Copy hash to clipboard
  const copyHash = async (e: React.MouseEvent, hash: string) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  // Handle ALL trades from WebSocket - no filtering
  const handleTrade = useCallback((trade: HLWSTrade) => {
    if (trade.coin !== symbol) return;

    const price = parseFloat(trade.px);
    const size = parseFloat(trade.sz);
    const notional = price * size;

    const newTrade: Trade = {
      id: `${trade.hash}-${tradeIdRef.current++}`,
      price,
      size,
      notional,
      side: trade.side === 'B' ? 'buy' : 'sell',
      time: trade.time,
      hash: trade.hash,
    };

    setTrades((prev) => {
      const updated = [newTrade, ...prev].slice(0, maxTrades);
      if (sortBySize) {
        return updated.sort((a, b) => b.notional - a.notional);
      }
      return updated;
    });
  }, [symbol, maxTrades, sortBySize]);

  const { isConnected, subscribeTrades } = useHyperliquidWS({
    autoConnect: true,
    onTrade: handleTrade,
  });

  useEffect(() => {
    if (isConnected) {
      subscribeTrades(symbol);
    }
  }, [isConnected, symbol, subscribeTrades]);

  // Fetch initial trades
  useEffect(() => {
    async function fetchInitialTrades() {
      try {
        const response = await fetch(
          `/api/trading/market-data?type=all-trades&coin=${symbol}`
        );
        if (response.ok) {
          const data = await response.json();
          let initialTrades: Trade[] = data.slice(0, maxTrades).map(
            (t: { price: number; size: number; notionalUsd: number; side: string; time: number; hash: string }, idx: number) => ({
              id: `init-${idx}`,
              price: t.price,
              size: t.size,
              notional: t.notionalUsd || t.price * t.size,
              side: t.side as 'buy' | 'sell',
              time: t.time,
              hash: t.hash,
            })
          );
          if (sortBySize) {
            initialTrades = initialTrades.sort((a, b) => b.notional - a.notional);
          }
          setTrades(initialTrades);
        }
      } catch (err) {
        console.error('Failed to fetch initial trades:', err);
      }
    }

    fetchInitialTrades();
  }, [symbol, maxTrades, sortBySize]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(6);
  };

  const formatSize = (size: number) => {
    if (size >= 1) return size.toFixed(4);
    return size.toFixed(6);
  };

  const formatNotional = (usd: number) => {
    if (usd >= 1000000) return `$${(usd / 1000000).toFixed(1)}M`;
    if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
  };

  // Highlight intensity based on trade size
  const getRowClass = (notional: number) => {
    if (notional >= 100000) return 'bg-yellow-500/10';
    if (notional >= 50000) return 'bg-yellow-500/5';
    return '';
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header - ultra compact */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/20 shrink-0">
        <span className="text-[11px] font-medium">Trades</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">{trades.length}</span>
          {isConnected ? (
            <Wifi className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <WifiOff className="h-2.5 w-2.5 text-yellow-500" />
          )}
        </div>
      </div>

      {/* Column headers - 4 columns now */}
      <div className="grid grid-cols-[1fr_0.8fr_0.7fr_0.5fr] px-1.5 py-0.5 text-[9px] text-muted-foreground border-b shrink-0">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Value</span>
        <span className="text-right">Time</span>
      </div>

      {/* Trades list */}
      <ScrollArea className="flex-1">
        <div>
          {trades.map((trade) => (
            <div
              key={trade.id}
              className={`grid grid-cols-[1fr_0.8fr_0.7fr_0.5fr] px-1.5 py-px text-[10px] font-mono hover:bg-muted/40 cursor-pointer transition-colors ${getRowClass(trade.notional)}`}
              onMouseEnter={() => setHoveredId(trade.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className={trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}>
                {formatPrice(trade.price)}
              </span>
              <span className="text-right tabular-nums text-foreground/80">
                {formatSize(trade.size)}
              </span>
              <span className={`text-right tabular-nums ${trade.notional >= 50000 ? 'text-yellow-500 font-medium' : 'text-foreground/60'}`}>
                {formatNotional(trade.notional)}
              </span>
              <div className="flex items-center justify-end gap-0.5">
                {hoveredId === trade.id ? (
                  <>
                    <button
                      onClick={(e) => copyHash(e, trade.hash)}
                      className="p-0.5 hover:bg-muted rounded"
                      title="Copy tx hash"
                    >
                      {copiedHash === trade.hash ? (
                        <Check className="h-2.5 w-2.5 text-green-500" />
                      ) : (
                        <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                      )}
                    </button>
                    <a
                      href={`https://app.hyperliquid.xyz/explorer/tx/${trade.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-0.5 hover:bg-muted rounded"
                      title="View on explorer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground hover:text-primary" />
                    </a>
                  </>
                ) : (
                  <span className="text-muted-foreground tabular-nums text-[9px]">
                    {formatTime(trade.time).slice(-5)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

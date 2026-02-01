'use client';

/**
 * Compact Whale Trades - Ultra-dense whale trade monitor
 * Shows ALL trades sorted by largest notional first
 * No threshold filtering - captures everything
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@kit/ui/badge';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Fish, Copy, Check, ExternalLink, Wifi, WifiOff, UserPlus } from 'lucide-react';
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
  user?: string; // wallet address if available
}

interface Props {
  symbols?: string[];
  onAddWallet?: (address: string) => void;
}

const MAX_TRADES = 100;
const MIN_THRESHOLD = 1000; // Very low threshold to capture most trades

export function CompactWhaleTrades({
  symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'DOGE', 'WIF', 'PEPE', 'BONK'],
  onAddWallet
}: Props) {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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
      user: trade.user,
    };

    setTrades((prev) => {
      if (prev.some((t) => t.id === newTrade.id)) return prev;
      // Insert and keep sorted by notional (largest first)
      const updated = [...prev, newTrade]
        .sort((a, b) => b.notionalUsd - a.notionalUsd)
        .slice(0, MAX_TRADES);
      return updated;
    });
  }, []);

  const { isConnected, subscribeTrades } = useHyperliquidWS({
    autoConnect: true,
    whaleThresholdUsd: MIN_THRESHOLD,
    onWhaleTrade: handleWhaleTrade,
  });

  // Subscribe to trades for all symbols
  useEffect(() => {
    if (isConnected) {
      symbols.forEach((symbol) => subscribeTrades(symbol));
    }
  }, [isConnected, symbols, subscribeTrades]);

  // Fetch initial whale trades
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchInitialTrades() {
      try {
        const allTrades: WhaleTrade[] = [];

        for (const symbol of symbols) {
          const response = await fetch(
            `/api/trading/market-data?type=whale-trades&coin=${symbol}&threshold=${MIN_THRESHOLD}`
          );
          if (response.ok) {
            const data = await response.json();
            const newTrades: WhaleTrade[] = data.map(
              (t: { coin: string; side: string; price: number; size: number; notionalUsd: number; time: number; hash: string; user?: string }) => ({
                id: `${t.hash}-init`,
                coin: t.coin || symbol,
                side: t.side as 'buy' | 'sell',
                price: t.price,
                size: t.size,
                notionalUsd: t.notionalUsd,
                time: t.time,
                hash: t.hash,
                user: t.user,
              })
            );
            allTrades.push(...newTrades);
          }
        }

        if (allTrades.length > 0) {
          // Sort by notional (largest first) and dedupe
          const filtered = allTrades
            .filter((trade, idx, arr) => arr.findIndex((t) => t.hash === trade.hash) === idx)
            .sort((a, b) => b.notionalUsd - a.notionalUsd)
            .slice(0, MAX_TRADES);
          setTrades(filtered);
        }
      } catch (err) {
        console.error('Failed to fetch initial whale trades:', err);
      }
    }

    fetchInitialTrades();
  }, [symbols]);

  const copyHash = async (e: React.MouseEvent, hash: string) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const formatNotional = (usd: number) => {
    if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
    if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
    return `$${usd.toFixed(0)}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Get row intensity based on notional
  const getRowClass = (notional: number) => {
    if (notional >= 1e6) return 'bg-purple-500/10';
    if (notional >= 500000) return 'bg-orange-500/10';
    if (notional >= 100000) return 'bg-yellow-500/5';
    return '';
  };

  if (trades.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Fish className="h-6 w-6 mb-1 opacity-50" />
        <p className="text-[10px]">Watching for whale trades...</p>
        <div className="flex items-center gap-1 text-[9px] mt-1">
          {isConnected ? (
            <>
              <Wifi className="h-2.5 w-2.5 text-green-500" />
              <span className="text-green-500">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-2.5 w-2.5 text-yellow-500" />
              <span className="text-yellow-500">Connecting...</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b shrink-0">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Fish className="h-3 w-3" />
          <span>Whales</span>
          {isConnected ? (
            <Wifi className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <WifiOff className="h-2.5 w-2.5 text-yellow-500" />
          )}
        </div>
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
          {trades.length} trades
        </Badge>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[0.6fr_0.5fr_0.8fr_0.6fr_0.5fr] gap-1 px-2 py-0.5 text-[9px] text-muted-foreground border-b shrink-0 bg-background">
        <span>Coin</span>
        <span>Side</span>
        <span className="text-right">Size</span>
        <span className="text-right">Value</span>
        <span className="text-right">Time</span>
      </div>

      {/* Trades - sorted by notional */}
      <ScrollArea className="flex-1">
        {trades.map((trade) => (
          <div
            key={trade.id}
            className={`grid grid-cols-[0.6fr_0.5fr_0.8fr_0.6fr_0.5fr] gap-1 px-2 py-px text-[10px] hover:bg-muted/30 cursor-pointer items-center ${getRowClass(trade.notionalUsd)}`}
            onMouseEnter={() => setHoveredId(trade.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <span className="font-medium">{trade.coin}</span>
            <Badge
              variant={trade.side === 'buy' ? 'default' : 'destructive'}
              className="text-[8px] px-0.5 py-0 h-3 w-fit"
            >
              {trade.side === 'buy' ? 'BUY' : 'SELL'}
            </Badge>
            <span className="text-right font-mono text-muted-foreground">
              {trade.size.toFixed(4)}
            </span>
            <span className={`text-right font-mono font-semibold ${trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
              {formatNotional(trade.notionalUsd)}
            </span>
            <div className="flex items-center justify-end gap-0.5">
              {hoveredId === trade.id ? (
                <>
                  <button
                    onClick={(e) => copyHash(e, trade.hash)}
                    className="text-muted-foreground hover:text-primary p-0.5"
                    title="Copy tx hash"
                  >
                    {copiedHash === trade.hash ? (
                      <Check className="h-2.5 w-2.5 text-green-500" />
                    ) : (
                      <Copy className="h-2.5 w-2.5" />
                    )}
                  </button>
                  <a
                    href={`https://app.hyperliquid.xyz/explorer/tx/${trade.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary p-0.5"
                    onClick={(e) => e.stopPropagation()}
                    title="View on explorer"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  {trade.user && onAddWallet && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddWallet(trade.user!);
                      }}
                      className="text-muted-foreground hover:text-primary p-0.5"
                      title="Add wallet to tracker"
                    >
                      <UserPlus className="h-2.5 w-2.5" />
                    </button>
                  )}
                </>
              ) : (
                <span className="text-[9px] text-muted-foreground font-mono">
                  {formatTime(trade.time).slice(-5)}
                </span>
              )}
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

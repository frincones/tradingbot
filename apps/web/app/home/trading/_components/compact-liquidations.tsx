'use client';

/**
 * Compact Liquidations Feed - Ultra-dense liquidation monitor
 * Shows ALL liquidations sorted by largest notional first
 * Uses heuristics to detect potential liquidations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@kit/ui/badge';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Flame, Copy, Check, ExternalLink, Wifi, WifiOff, Skull, UserPlus } from 'lucide-react';
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
  user?: string;
  confidence: 'high' | 'medium' | 'low';
}

interface Props {
  symbols?: string[];
  onAddWallet?: (address: string) => void;
}

const MAX_LIQUIDATIONS = 100;
const MIN_THRESHOLD = 10000; // $10K minimum - lower to capture more

// Detect potential liquidations based on trade characteristics
function detectLiquidation(trade: HLWSTrade): { isLiq: boolean; confidence: 'high' | 'medium' | 'low' } {
  const price = parseFloat(trade.px);
  const size = parseFloat(trade.sz);
  const notional = price * size;

  if (notional < MIN_THRESHOLD) return { isLiq: false, confidence: 'low' };

  // Very large trades are highly likely liquidations
  if (notional >= 500000) return { isLiq: true, confidence: 'high' };
  if (notional >= 100000) return { isLiq: true, confidence: 'medium' };
  if (notional >= MIN_THRESHOLD) return { isLiq: true, confidence: 'low' };

  return { isLiq: false, confidence: 'low' };
}

export function CompactLiquidations({
  symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'DOGE', 'WIF', 'PEPE', 'BONK'],
  onAddWallet
}: Props) {
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [stats, setStats] = useState({ longs: 0, shorts: 0, total: 0 });

  // Process trades to detect liquidations
  const handleTrade = useCallback((trade: HLWSTrade) => {
    const detection = detectLiquidation(trade);

    if (detection.isLiq) {
      const price = parseFloat(trade.px);
      const size = parseFloat(trade.sz);
      // B (buy) = short getting liquidated, S/A = long getting liquidated
      const side = trade.side === 'B' ? 'short' : 'long';

      const liq: Liquidation = {
        id: `${trade.hash}-${trade.tid || Date.now()}`,
        coin: trade.coin,
        side,
        price,
        size,
        notionalUsd: price * size,
        time: trade.time,
        hash: trade.hash,
        user: trade.user,
        confidence: detection.confidence,
      };

      setLiquidations((prev) => {
        if (prev.some((l) => l.id === liq.id)) return prev;
        // Keep sorted by notional (largest first)
        return [...prev, liq]
          .sort((a, b) => b.notionalUsd - a.notionalUsd)
          .slice(0, MAX_LIQUIDATIONS);
      });

      setStats((prev) => ({
        longs: prev.longs + (side === 'long' ? 1 : 0),
        shorts: prev.shorts + (side === 'short' ? 1 : 0),
        total: prev.total + price * size,
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

  // Reset stats hourly
  useEffect(() => {
    const interval = setInterval(() => {
      setStats({ longs: 0, shorts: 0, total: 0 });
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  // Get row intensity based on notional
  const getRowClass = (notional: number, confidence: string) => {
    if (notional >= 1e6) return 'bg-orange-500/20 animate-pulse';
    if (notional >= 500000) return 'bg-orange-500/15';
    if (notional >= 250000) return 'bg-yellow-500/10';
    if (confidence === 'high') return 'bg-red-500/5';
    return '';
  };

  if (liquidations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Skull className="h-6 w-6 mb-1 opacity-50" />
        <p className="text-[10px]">Watching for liquidations...</p>
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
      {/* Header with stats */}
      <div className="flex items-center justify-between px-2 py-1 border-b shrink-0">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Flame className="h-3 w-3 text-orange-500" />
          <span>Liqs</span>
          {isConnected ? (
            <Wifi className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <WifiOff className="h-2.5 w-2.5 text-yellow-500" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[8px] px-0.5 py-0 h-3 text-green-500">
            L:{stats.longs}
          </Badge>
          <Badge variant="outline" className="text-[8px] px-0.5 py-0 h-3 text-red-500">
            S:{stats.shorts}
          </Badge>
          <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3">
            {formatNotional(stats.total)}
          </Badge>
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[0.6fr_0.6fr_0.6fr_0.6fr_0.5fr] gap-1 px-2 py-0.5 text-[9px] text-muted-foreground border-b shrink-0 bg-background">
        <span>Coin</span>
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Value</span>
        <span className="text-right">Ago</span>
      </div>

      {/* Liquidations - sorted by notional */}
      <ScrollArea className="flex-1">
        {liquidations.map((liq) => (
          <div
            key={liq.id}
            className={`grid grid-cols-[0.6fr_0.6fr_0.6fr_0.6fr_0.5fr] gap-1 px-2 py-px text-[10px] hover:bg-muted/30 cursor-pointer items-center ${getRowClass(liq.notionalUsd, liq.confidence)}`}
            onMouseEnter={() => setHoveredId(liq.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <span className="font-medium">{liq.coin}</span>
            <Badge
              variant={liq.side === 'long' ? 'default' : 'destructive'}
              className="text-[8px] px-0.5 py-0 h-3 w-fit"
            >
              {liq.side === 'long' ? 'LONG' : 'SHORT'}
            </Badge>
            <span className="text-right font-mono text-muted-foreground">
              ${liq.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-right font-mono font-semibold text-orange-500">
              {formatNotional(liq.notionalUsd)}
            </span>
            <div className="flex items-center justify-end gap-0.5">
              {hoveredId === liq.id ? (
                <>
                  <button
                    onClick={(e) => copyHash(e, liq.hash)}
                    className="text-muted-foreground hover:text-primary p-0.5"
                    title="Copy tx hash"
                  >
                    {copiedHash === liq.hash ? (
                      <Check className="h-2.5 w-2.5 text-green-500" />
                    ) : (
                      <Copy className="h-2.5 w-2.5" />
                    )}
                  </button>
                  <a
                    href={`https://app.hyperliquid.xyz/explorer/tx/${liq.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary p-0.5"
                    onClick={(e) => e.stopPropagation()}
                    title="View on explorer (find wallet)"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  {liq.user && onAddWallet && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddWallet(liq.user!);
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
                  {formatTime(liq.time)}
                </span>
              )}
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

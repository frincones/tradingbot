'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@kit/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { ScrollArea } from '@kit/ui/scroll-area';
import { BarChart3 } from 'lucide-react';
import { useHyperliquidWS, type HLWSActiveAssetData } from '~/lib/hooks/use-hyperliquid-ws';

interface AssetStats {
  coin: string;
  markPrice: number;
  oraclePrice: number;
  funding: number;
  fundingAnnualized: number;
  openInterest: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePct24h: number;
  premium: number;
  maxLeverage: number;
}

interface Props {
  symbol?: string;
}

export function MarketStats({ symbol = 'BTC' }: Props) {
  const [stats, setStats] = useState<AssetStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState(symbol);

  // Handle realtime updates
  const handleActiveAssetData = useCallback((data: HLWSActiveAssetData) => {
    setStats((prev) =>
      prev.map((stat) =>
        stat.coin === data.coin
          ? {
              ...stat,
              markPrice: parseFloat(data.markPx),
              openInterest: data.openInterest ? parseFloat(data.openInterest) : stat.openInterest,
              funding: data.funding ? parseFloat(data.funding) : stat.funding,
            }
          : stat
      )
    );
  }, []);

  const { isConnected, subscribeActiveAssetData } = useHyperliquidWS({
    autoConnect: true,
    onActiveAssetData: handleActiveAssetData,
  });

  // Fetch all coin stats
  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/trading/market-data?type=all-stats');
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data: AssetStats[] = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No data returned');
      }
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch market stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    if (isConnected) {
      subscribeActiveAssetData(activeSymbol);
    }
  }, [isConnected, activeSymbol, subscribeActiveAssetData]);

  const formatNumber = (num: number, decimals = 2) =>
    num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  const formatUsd = (num: number) =>
    num >= 1e9
      ? `$${(num / 1e9).toFixed(1)}B`
      : num >= 1e6
        ? `$${(num / 1e6).toFixed(1)}M`
        : `$${(num / 1e3).toFixed(0)}K`;

  const formatFunding = (rate: number) => {
    const pct = rate * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(4)}%`;
  };

  const topVolume = [...stats].sort((a, b) => b.volume24h - a.volume24h).slice(0, 10);
  const topOI = [...stats].sort((a, b) => b.openInterest - a.openInterest).slice(0, 10);
  const topFunding = [...stats]
    .filter((s) => Math.abs(s.funding) > 0.00001)
    .sort((a, b) => Math.abs(b.funding) - Math.abs(a.funding))
    .slice(0, 10);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || stats.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <BarChart3 className="h-6 w-6 mb-1 opacity-50" />
        <p className="text-[10px]">{error || 'No market data'}</p>
        <button
          onClick={fetchStats}
          className="text-[10px] text-primary hover:underline mt-1"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="volume" className="h-full flex flex-col">
        <TabsList className="h-6 bg-transparent px-1 shrink-0">
          <TabsTrigger value="volume" className="text-[10px] h-5 px-2">Vol</TabsTrigger>
          <TabsTrigger value="oi" className="text-[10px] h-5 px-2">OI</TabsTrigger>
          <TabsTrigger value="funding" className="text-[10px] h-5 px-2">Fund</TabsTrigger>
        </TabsList>

        <TabsContent value="volume" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-[1fr_0.6fr_0.8fr] gap-1 px-2 py-0.5 text-[9px] text-muted-foreground border-b sticky top-0 bg-background">
              <span>Coin</span>
              <span className="text-right">24h %</span>
              <span className="text-right">Volume</span>
            </div>
            {topVolume.map((stat) => (
              <div
                key={stat.coin}
                className="grid grid-cols-[1fr_0.6fr_0.8fr] gap-1 px-2 py-0.5 text-[10px] hover:bg-muted/30 cursor-pointer"
                onClick={() => setActiveSymbol(stat.coin)}
              >
                <span className="font-medium">{stat.coin}</span>
                <span className={`text-right font-mono ${stat.priceChangePct24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {stat.priceChangePct24h >= 0 ? '+' : ''}{formatNumber(stat.priceChangePct24h)}%
                </span>
                <span className="text-right font-mono text-muted-foreground">{formatUsd(stat.volume24h)}</span>
              </div>
            ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="oi" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-[1fr_0.5fr_0.8fr] gap-1 px-2 py-0.5 text-[9px] text-muted-foreground border-b sticky top-0 bg-background">
              <span>Coin</span>
              <span className="text-right">Lev</span>
              <span className="text-right">OI</span>
            </div>
            {topOI.map((stat) => (
              <div
                key={stat.coin}
                className="grid grid-cols-[1fr_0.5fr_0.8fr] gap-1 px-2 py-0.5 text-[10px] hover:bg-muted/30 cursor-pointer"
                onClick={() => setActiveSymbol(stat.coin)}
              >
                <span className="font-medium">{stat.coin}</span>
                <span className="text-right text-muted-foreground">{stat.maxLeverage}x</span>
                <span className="text-right font-mono text-muted-foreground">{formatUsd(stat.openInterest)}</span>
              </div>
            ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="funding" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-[1fr_0.7fr_0.7fr] gap-1 px-2 py-0.5 text-[9px] text-muted-foreground border-b sticky top-0 bg-background">
              <span>Coin</span>
              <span className="text-right">8h</span>
              <span className="text-right">Ann.</span>
            </div>
            {topFunding.map((stat) => (
              <div
                key={stat.coin}
                className="grid grid-cols-[1fr_0.7fr_0.7fr] gap-1 px-2 py-0.5 text-[10px] hover:bg-muted/30 cursor-pointer"
                onClick={() => setActiveSymbol(stat.coin)}
              >
                <span className="font-medium">{stat.coin}</span>
                <span className={`text-right font-mono ${stat.funding >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatFunding(stat.funding)}
                </span>
                <span className={`text-right font-mono text-[9px] ${stat.fundingAnnualized >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                  {stat.fundingAnnualized >= 0 ? '+' : ''}{formatNumber(stat.fundingAnnualized)}%
                </span>
              </div>
            ))}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

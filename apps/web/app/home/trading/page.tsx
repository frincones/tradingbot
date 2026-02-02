'use client';

/**
 * Trading Workbench - Hyperliquid Style
 * Ultra-compact, dense layout optimized for professional trading
 * Zero friction, maximum data density
 */

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { Badge } from '@kit/ui/badge';
import { Activity, Wallet, TrendingUp, BarChart3, Wifi, WifiOff, Fish, Flame, BellRing, Brain } from 'lucide-react';
import { useHyperliquidWS, type HLWSActiveAssetData } from '~/lib/hooks/use-hyperliquid-ws';
import { useAlertCollector } from '~/lib/hooks/use-alert-collector';
import { toast } from 'sonner';
import type { SentinelResponse, AgentAlert } from '@kit/trading-core';

// Minimal skeleton - ultra compact
const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse bg-muted/30 ${className}`} />
);

// Dynamic imports - SSR disabled for WebSocket components
const TradingChart = dynamic(
  () => import('./_components/trading-chart').then((mod) => mod.TradingChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  }
);

const CompactOrderBook = dynamic(
  () => import('./_components/compact-orderbook').then((mod) => mod.CompactOrderBook),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const TradeFeed = dynamic(
  () => import('./_components/trade-feed').then((mod) => mod.TradeFeed),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const MarketStats = dynamic(
  () => import('./_components/market-stats').then((mod) => mod.MarketStats),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const WalletTracker = dynamic(
  () => import('./_components/wallet-tracker').then((mod) => mod.WalletTracker),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const OpenPositions = dynamic(
  () => import('./_components/open-positions').then((mod) => mod.OpenPositions),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const ActiveStrategies = dynamic(
  () => import('./_components/active-strategies').then((mod) => mod.ActiveStrategies),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const CompactWhaleTrades = dynamic(
  () => import('./_components/compact-whale-trades').then((mod) => mod.CompactWhaleTrades),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const CompactLiquidations = dynamic(
  () => import('./_components/compact-liquidations').then((mod) => mod.CompactLiquidations),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const AlertsFeed = dynamic(
  () => import('./_components/alerts-feed').then((mod) => mod.AlertsFeed),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

const AtlasPanel = dynamic(
  () => import('./_components/atlas-panel').then((mod) => mod.AtlasPanel),
  { ssr: false, loading: () => <Skeleton className="h-full" /> }
);

// Format helpers
const formatPrice = (price: string | number | undefined) => {
  if (!price) return '--';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (num >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num.toFixed(4);
};

const formatPercent = (value: string | number | undefined) => {
  if (!value) return '--';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const percent = num * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(4)}%`;
};

const formatVolume = (value: string | number | undefined) => {
  if (!value) return '--';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
};

export default function TradingDashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [marketData, setMarketData] = useState<HLWSActiveAssetData | null>(null);
  const [newAlertCount, setNewAlertCount] = useState(0);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

  const handleActiveAssetData = useCallback((data: HLWSActiveAssetData) => {
    if (data.coin === selectedSymbol) {
      setMarketData(data);
    }
    // Update current prices
    if (data.markPx) {
      const price = parseFloat(data.markPx);
      setCurrentPrices((prev) => ({ ...prev, [data.coin]: price }));
    }
  }, [selectedSymbol]);

  const { isConnected, subscribeActiveAssetData, unsubscribeActiveAssetData } = useHyperliquidWS({
    autoConnect: true,
    onActiveAssetData: handleActiveAssetData,
  });

  // Alert collector for AI analysis
  const handleNewAlert = useCallback((_alert: SentinelResponse) => {
    setNewAlertCount((c) => c + 1);
    // Auto-clear badge after viewing
    setTimeout(() => setNewAlertCount((c) => Math.max(0, c - 1)), 30000);
  }, []);

  const {
    isAnalyzing: _isAnalyzing,
    alertCount: _alertCount,
  } = useAlertCollector({
    symbol: selectedSymbol,
    enabled: true,
    analysisIntervalMs: 30000, // Analyze every 30 seconds
    whaleThresholdUsd: 10000, // Lowered to capture more whale activity
    onNewAlert: handleNewAlert,
    onAnalysisComplete: (result) => {
      console.log('[Sentinel] Analysis result:', result.decision, result.confidence);
    },
    onAnalysisError: (error) => {
      console.error('[Sentinel] Analysis error:', error);
    },
  });

  // Subscribe to active asset data for selected symbol
  useEffect(() => {
    if (isConnected) {
      subscribeActiveAssetData(selectedSymbol);
      return () => unsubscribeActiveAssetData(selectedSymbol);
    }
  }, [isConnected, selectedSymbol, subscribeActiveAssetData, unsubscribeActiveAssetData]);

  const fundingRate = marketData?.funding ? parseFloat(marketData.funding) : 0;

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col bg-background">
      {/* Top Bar - Ultra compact symbol info */}
      <div className="flex items-center justify-between px-3 py-1 border-b bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">{selectedSymbol}-USDC</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">PERP</Badge>
          </div>
          <span className="text-sm font-mono font-semibold text-foreground">
            {formatPrice(marketData?.markPx)}
          </span>
          {isConnected ? (
            <Wifi className="h-3 w-3 text-green-500" />
          ) : (
            <WifiOff className="h-3 w-3 text-yellow-500" />
          )}
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Mark</span>
            <span className="font-mono">{formatPrice(marketData?.markPx)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Oracle</span>
            <span className="font-mono">{formatPrice(marketData?.oraclePx)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">24h Vol</span>
            <span className="font-mono">{formatVolume(marketData?.dayNtlVlm)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">OI</span>
            <span className="font-mono">{formatVolume(marketData?.openInterest)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Funding</span>
            <span className={`font-mono ${fundingRate >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatPercent(marketData?.funding)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content - Flex layout for better proportions */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Chart - Takes remaining space */}
        <div className="flex-1 min-w-0 border-r">
          <TradingChart onSymbolChange={setSelectedSymbol} />
        </div>

        {/* Right: Order Book + Trades - Fixed width */}
        <div className="w-[320px] flex flex-col shrink-0">
          {/* Order Book - 55% height */}
          <div className="flex-[55] min-h-0 border-b">
            <CompactOrderBook symbol={selectedSymbol} levels={15} />
          </div>

          {/* Trade Feed - 45% height */}
          <div className="flex-[45] min-h-0">
            <TradeFeed symbol={selectedSymbol} maxTrades={50} />
          </div>
        </div>
      </div>

      {/* Bottom Panel - Compact tabbed area */}
      <div className="h-[180px] border-t bg-card/30 shrink-0">
        <Tabs defaultValue="whales" className="h-full flex flex-col">
          <div className="border-b shrink-0">
            <TabsList className="h-7 bg-transparent px-2">
              <TabsTrigger value="whales" className="text-[11px] h-6 px-2 gap-1">
                <Fish className="h-3 w-3" />
                Whales
              </TabsTrigger>
              <TabsTrigger value="liqs" className="text-[11px] h-6 px-2 gap-1">
                <Flame className="h-3 w-3" />
                Liqs
              </TabsTrigger>
              <TabsTrigger value="positions" className="text-[11px] h-6 px-2 gap-1">
                <Wallet className="h-3 w-3" />
                Positions
              </TabsTrigger>
              <TabsTrigger value="strategies" className="text-[11px] h-6 px-2 gap-1">
                <TrendingUp className="h-3 w-3" />
                Strategies
              </TabsTrigger>
              <TabsTrigger value="wallets" className="text-[11px] h-6 px-2 gap-1">
                <Activity className="h-3 w-3" />
                Wallets
              </TabsTrigger>
              <TabsTrigger value="stats" className="text-[11px] h-6 px-2 gap-1">
                <BarChart3 className="h-3 w-3" />
                Stats
              </TabsTrigger>
              <TabsTrigger value="alerts" className="text-[11px] h-6 px-2 gap-1">
                <BellRing className="h-3 w-3" />
                Alerts
                {newAlertCount > 0 && (
                  <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 ml-1">
                    {newAlertCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="atlas" className="text-[11px] h-6 px-2 gap-1">
                <Brain className="h-3 w-3" />
                Atlas
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            <TabsContent value="whales" className="h-full m-0">
              <CompactWhaleTrades />
            </TabsContent>

            <TabsContent value="liqs" className="h-full m-0">
              <CompactLiquidations />
            </TabsContent>

            <TabsContent value="positions" className="h-full m-0 p-1.5">
              <OpenPositions />
            </TabsContent>

            <TabsContent value="strategies" className="h-full m-0 p-1.5">
              <ActiveStrategies />
            </TabsContent>

            <TabsContent value="wallets" className="h-full m-0 p-1.5">
              <WalletTracker />
            </TabsContent>

            <TabsContent value="stats" className="h-full m-0 p-1.5">
              <MarketStats symbol={selectedSymbol} />
            </TabsContent>

            <TabsContent value="alerts" className="h-full m-0">
              <AlertsFeed />
            </TabsContent>

            {/* Atlas panel MUST stay mounted for timers to work - forceMount keeps hooks running */}
            <TabsContent value="atlas" forceMount className="h-full m-0 data-[state=inactive]:hidden">
              <AtlasPanel
                symbol={selectedSymbol}
                enabled={true}
                onEntryApproved={(candidateId) => {
                  toast.success(`Entry approved: ${candidateId.slice(0, 8)}...`);
                }}
                onActionProposed={(tradeId, actionType) => {
                  toast.info(`Action proposed: ${actionType} for ${tradeId.slice(0, 8)}...`);
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

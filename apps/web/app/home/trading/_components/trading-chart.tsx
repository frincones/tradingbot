'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@kit/ui/card';
import { Button } from '@kit/ui/button';
import { Badge } from '@kit/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Activity, TrendingUp, TrendingDown, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import { useHyperliquidWS, type HLWSCandle } from '~/lib/hooks/use-hyperliquid-ws';

interface CandleData {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

const INTERVALS = [
  { value: '1m', label: '1m', hours: 6 },
  { value: '5m', label: '5m', hours: 24 },
  { value: '15m', label: '15m', hours: 48 },
  { value: '1h', label: '1H', hours: 168 },
  { value: '4h', label: '4H', hours: 336 },
  { value: '1d', label: '1D', hours: 720 },
];

// Fallback symbols if API fails
const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL', 'AVAX', 'DOGE', 'ARB', 'OP', 'LINK', 'MATIC', 'APT', 'SUI', 'SEI', 'INJ', 'TIA', 'JUP', 'WIF', 'PEPE', 'BONK'];

interface Props {
  onSymbolChange?: (symbol: string) => void;
}

export function TradingChart({ onSymbolChange }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lastCandleTimeRef = useRef<number>(0);

  const [symbol, setSymbol] = useState('BTC');
  const [availableSymbols, setAvailableSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [interval, setIntervalState] = useState('1m'); // Start with 1m for realtime feel
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [ohlc, setOhlc] = useState<{ o: number; h: number; l: number; c: number } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [realtimeUpdates, setRealtimeUpdates] = useState(0);

  // Hyperliquid WebSocket for realtime updates
  const {
    isConnected,
    connectionStatus,
    subscribeCandles,
    unsubscribeCandles,
  } = useHyperliquidWS({
    autoConnect: true,
    onCandle: useCallback((candle: HLWSCandle) => {
      // Only process candles for the current symbol and interval
      if (candle.s !== symbol || candle.i !== interval) {
        return;
      }

      const candleTimeMs = candle.t;
      const candleTime = Math.floor(candleTimeMs / 1000) as Time;
      const open = parseFloat(candle.o);
      const high = parseFloat(candle.h);
      const low = parseFloat(candle.l);
      const close = parseFloat(candle.c);
      const volume = parseFloat(candle.v);

      // Only update if this candle is >= our last candle time
      // lightweight-charts can only update the most recent candle
      if (candleTimeMs < lastCandleTimeRef.current) {
        return;
      }

      // Update last candle time reference
      lastCandleTimeRef.current = candleTimeMs;

      // Update or create candle
      if (candleSeriesRef.current) {
        try {
          const candleData: CandlestickData<Time> = {
            time: candleTime,
            open,
            high,
            low,
            close,
          };
          candleSeriesRef.current.update(candleData);
        } catch (err) {
          // Ignore update errors for older candles
          console.debug('[TradingChart] Candle update skipped:', err);
        }
      }

      if (volumeSeriesRef.current) {
        try {
          volumeSeriesRef.current.update({
            time: candleTime,
            value: volume,
            color: close >= open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
          });
        } catch (err) {
          // Ignore update errors
        }
      }

      // Update price display
      setCurrentPrice(close);
      setOhlc({ o: open, h: high, l: low, c: close });
      setLastUpdate(new Date());
      setRealtimeUpdates((prev) => prev + 1);
    }, [symbol, interval]),
    onConnect: useCallback(() => {
      console.log('[TradingChart] WebSocket connected');
    }, []),
    onDisconnect: useCallback(() => {
      console.log('[TradingChart] WebSocket disconnected');
    }, []),
  });

  // Fetch available symbols from Hyperliquid
  useEffect(() => {
    async function fetchSymbols() {
      try {
        const response = await fetch('/api/trading/market-data?type=meta');
        if (response.ok) {
          const meta: { universe: AssetMeta[] } = await response.json();
          if (meta.universe && Array.isArray(meta.universe)) {
            const symbols = meta.universe.map((a) => a.name).filter((s) => s && s.length > 0);
            if (symbols.length > 0) {
              setAvailableSymbols(symbols);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch symbols:', err);
      }
    }
    fetchSymbols();
  }, []);

  // Calculate start time based on interval
  const getStartTime = useCallback((intervalValue: string): number => {
    const intervalConfig = INTERVALS.find((i) => i.value === intervalValue);
    const hoursBack = intervalConfig?.hours || 168;
    return Date.now() - hoursBack * 60 * 60 * 1000;
  }, []);

  const fetchCandles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const startTime = getStartTime(interval);
      const response = await fetch(
        `/api/trading/market-data?type=candles&coin=${symbol}&interval=${interval}&source=hyperliquid&startTime=${startTime}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch candles');
      }

      const data: CandleData[] = await response.json();

      if (!data || data.length === 0) {
        setError('No candle data available');
        setLoading(false);
        return;
      }

      // Sort by time ascending
      data.sort((a, b) => a.t - b.t);

      const candleData: CandlestickData<Time>[] = data.map((c) => ({
        time: (c.t / 1000) as Time,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      }));

      const volumeData: HistogramData<Time>[] = data.map((c) => ({
        time: (c.t / 1000) as Time,
        value: c.v,
        color: c.c >= c.o ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
      }));

      if (candleSeriesRef.current && volumeSeriesRef.current) {
        candleSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);
        chartRef.current?.timeScale().fitContent();
      }

      // Track last candle time for WebSocket updates
      const lastCandle = data[data.length - 1];
      if (lastCandle) {
        lastCandleTimeRef.current = lastCandle.t;
      }

      // Set current price info
      const firstCandle = data[0];
      if (lastCandle && firstCandle) {
        setCurrentPrice(lastCandle.c);
        setOhlc({ o: lastCandle.o, h: lastCandle.h, l: lastCandle.l, c: lastCandle.c });
        const change = ((lastCandle.c - firstCandle.o) / firstCandle.o) * 100;
        setPriceChange(change);
      }

      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch candles:', err);
      setError('Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [symbol, interval, getStartTime]);

  // Handle symbol change
  const handleSymbolChange = useCallback((newSymbol: string) => {
    // Unsubscribe from old symbol
    unsubscribeCandles(symbol, interval);

    setSymbol(newSymbol);
    onSymbolChange?.(newSymbol);
    setRealtimeUpdates(0);

    // Subscribe to new symbol
    subscribeCandles(newSymbol, interval);
  }, [symbol, interval, onSymbolChange, subscribeCandles, unsubscribeCandles]);

  // Handle interval change
  const handleIntervalChange = useCallback((newInterval: string) => {
    // Unsubscribe from old interval
    unsubscribeCandles(symbol, interval);

    setIntervalState(newInterval);
    setRealtimeUpdates(0);

    // Subscribe to new interval
    subscribeCandles(symbol, newInterval);
  }, [symbol, interval, subscribeCandles, unsubscribeCandles]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(156, 163, 175, 0.1)' },
        horzLines: { color: 'rgba(156, 163, 175, 0.1)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: 'rgba(156, 163, 175, 0.4)',
          style: 2,
        },
        horzLine: {
          width: 1,
          color: 'rgba(156, 163, 175, 0.4)',
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(156, 163, 175, 0.2)',
        scaleMargins: {
          top: 0.05,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: 'rgba(156, 163, 175, 0.2)',
        timeVisible: true,
        secondsVisible: interval === '1m',
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    chartRef.current = chart;

    // Add candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });
    candleSeriesRef.current = candleSeries;

    // Add volume series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to WebSocket when symbol/interval changes
  useEffect(() => {
    if (isConnected) {
      subscribeCandles(symbol, interval);
    }

    return () => {
      unsubscribeCandles(symbol, interval);
    };
  }, [isConnected, symbol, interval, subscribeCandles, unsubscribeCandles]);

  // Fetch initial historical data and set up polling fallback
  useEffect(() => {
    fetchCandles();

    // Set up polling fallback when WebSocket is not connected
    // This ensures chart still updates even if WebSocket fails
    let pollInterval: NodeJS.Timeout | null = null;

    if (!isConnected && connectionStatus !== 'connecting') {
      // Poll every 10 seconds when WebSocket is not available
      const pollMs = interval === '1m' ? 5000 : interval === '5m' ? 10000 : 15000;
      pollInterval = setInterval(() => {
        fetchCandles();
      }, pollMs);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [fetchCandles, isConnected, connectionStatus, interval]);

  const formatPrice = (price: number) =>
    price.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: price < 1 ? 4 : 2,
      maximumFractionDigits: price < 1 ? 6 : 2,
    });

  return (
    <Card className="col-span-full border-0 bg-card/50">
      <CardHeader className="pb-2 px-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Symbol Selector */}
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <Select value={symbol} onValueChange={handleSymbolChange}>
                <SelectTrigger className="w-[130px] h-9 font-bold text-lg border-0 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  {availableSymbols.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}/USD
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Current Price */}
            {currentPrice && (
              <div className="flex items-center gap-3">
                <span className="text-2xl font-mono font-bold tabular-nums">
                  {formatPrice(currentPrice)}
                </span>
                <Badge
                  variant={priceChange >= 0 ? 'default' : 'destructive'}
                  className="flex items-center gap-1 font-mono"
                >
                  {priceChange >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {priceChange >= 0 ? '+' : ''}
                  {priceChange.toFixed(2)}%
                </Badge>
              </div>
            )}

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Badge variant="outline" className="text-xs gap-1 text-green-500 border-green-500/30">
                  <Wifi className="h-3 w-3" />
                  LIVE
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs gap-1 text-yellow-500 border-yellow-500/30">
                  <WifiOff className="h-3 w-3" />
                  {connectionStatus}
                </Badge>
              )}
              {realtimeUpdates > 0 && (
                <span className="text-xs text-muted-foreground">
                  {realtimeUpdates} updates
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* OHLC Display */}
            {ohlc && (
              <div className="hidden xl:flex items-center gap-4 text-sm font-mono mr-4">
                <span>
                  O <span className="text-muted-foreground tabular-nums">{ohlc.o.toFixed(2)}</span>
                </span>
                <span>
                  H <span className="text-green-500 tabular-nums">{ohlc.h.toFixed(2)}</span>
                </span>
                <span>
                  L <span className="text-red-500 tabular-nums">{ohlc.l.toFixed(2)}</span>
                </span>
                <span>
                  C <span className="text-muted-foreground tabular-nums">{ohlc.c.toFixed(2)}</span>
                </span>
              </div>
            )}

            {/* Interval Selector */}
            <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
              {INTERVALS.map((int) => (
                <Button
                  key={int.value}
                  variant={interval === int.value ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => handleIntervalChange(int.value)}
                >
                  {int.label}
                </Button>
              ))}
            </div>

            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={fetchCandles}
              disabled={loading}
              title="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Last update timestamp */}
        {lastUpdate && (
          <div className="text-xs text-muted-foreground mt-2">
            Last update: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="relative h-[600px] w-full">
          {loading && !candleSeriesRef.current?.data && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">Loading chart...</span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <p className="text-destructive mb-2">{error}</p>
                <Button variant="outline" size="sm" onClick={fetchCandles}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          <div ref={chartContainerRef} className="h-full w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

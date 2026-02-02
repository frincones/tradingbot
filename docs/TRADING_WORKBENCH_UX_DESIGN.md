# 🎨 TRADING WORKBENCH — Diseño UX/UI Consolidado

**Versión:** 1.0
**Fecha:** 2026-01-31
**Rol:** Designer UX/UI Agent

---

## 📋 RESUMEN EJECUTIVO

Este documento redefine la experiencia del trader consolidando **toda la información operativa en una sola vista**: el **Trading Workbench**. Inspirado en plataformas profesionales como TradingView, Thinkorswim y Sierra Chart, pero optimizado para trading algorítmico con señales, whales y agentes AI.

### Filosofía de Diseño

> **"Un trader no debe cambiar de página para tomar decisiones. Todo lo que necesita debe estar visible en tiempo real."**

---

## 🖥️ LAYOUT PRINCIPAL — Trading Workbench

### Vista General (Full Screen)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ [HEADER BAR]                                                                                 │
│ Logo │ BTC/USD ▼ │ Strategy: Flush+Burst v2 ▼ │ 🟢 PAPER │ ⏱ 14:32:15 │ 🔴 Kill │ ⚙️ │ 👤 │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  ┌─────────────────────────────────────────────────┐  ┌─────────────────────────────────┐   │
│  │                                                  │  │  SIGNALS & SCORES               │   │
│  │                                                  │  │  ─────────────────────────────  │   │
│  │                                                  │  │  Setup: LONG ⬆                  │   │
│  │              CANDLESTICK CHART                   │  │  Flush:     ████████░░ 82%     │   │
│  │              (TradingView-style)                 │  │  Burst:     ███████░░░ 74%     │   │
│  │                                                  │  │  Absorption:██████░░░░ 63%     │   │
│  │              • Price action                      │  │  ─────────────────────────────  │   │
│  │              • Entry/Exit levels                 │  │  ✓ Reclaim  ✓ Volume  ○ Whale  │   │
│  │              • TP/SL lines                       │  │  ─────────────────────────────  │   │
│  │              • Signal markers                    │  │  Entry: $102,450  SL: $101,400 │   │
│  │              • Whale events                      │  │  TP: $104,400     R:R 2.0      │   │
│  │                                                  │  ├─────────────────────────────────┤   │
│  │                                                  │  │  POSITION                       │   │
│  │                                                  │  │  ─────────────────────────────  │   │
│  │                                                  │  │  LONG 0.025 BTC @ $102,380     │   │
│  │                                                  │  │  PnL: +$127.50 (+1.25%)        │   │
│  │                                                  │  │  [Close] [Modify TP/SL]        │   │
│  │                                                  │  ├─────────────────────────────────┤   │
│  │                                                  │  │  RISK STATUS                    │   │
│  │                                                  │  │  Daily Loss: ████░░ $234/$500  │   │
│  │                                                  │  │  Trades: 3/10                   │   │
│  └─────────────────────────────────────────────────┘  │  Cooldown: --                   │   │
│                                                        └─────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐   │
│  │ [TABS] Activity │ Orders │ History │ Whales │ AI Copilot                              │   │
│  ├──────────────────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                                       │   │
│  │  14:32:05  🟢 Signal LONG generated (flush: 82%, burst: 74%)                         │   │
│  │  14:32:06  ✓ Risk approved - Intent #I-4521 created                                  │   │
│  │  14:32:07  📤 Order submitted to Alpaca (market buy 0.025 BTC)                       │   │
│  │  14:32:08  ✓ Order filled @ $102,380 (slippage: 0.02%)                               │   │
│  │  14:30:22  🐋 Whale "GCR" increased BTC long +15%                                    │   │
│  │  14:28:15  ⚠️ Drift guard: HL-Alpaca spread 0.08% (OK)                               │   │
│  │                                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 COMPONENTES DEL WORKBENCH

### 1. Header Bar (Barra Superior)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 📈 │ BTC/USD ▼ │ Strategy: Flush+Burst v2 ▼ │ 🟢 PAPER │ ⏱ 14:32:15 │ 🔴 │ ⚙️ │ 👤 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

| Elemento | Función | Interacción |
|----------|---------|-------------|
| **Symbol Selector** | Cambiar par de trading | Dropdown con búsqueda |
| **Strategy Selector** | Filtrar por estrategia activa | Dropdown + crear nueva |
| **Mode Badge** | Paper/Live indicator | Click para cambiar (con confirmación) |
| **Clock** | Hora del servidor (UTC/local) | Toggle timezone |
| **Kill Switch** | Emergencia - detener todo | Click + confirmación |
| **Settings** | Configuración rápida | Sheet lateral |
| **Profile** | Usuario y logout | Dropdown menu |

**Código de componente:**

```tsx
// components/workbench/header-bar.tsx
'use client';

import { useState } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@kit/ui/select';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@kit/ui/alert-dialog';
import { cn } from '@kit/ui/lib/utils';

interface HeaderBarProps {
  symbols: string[];
  strategies: Strategy[];
  currentSymbol: string;
  currentStrategy: string | null;
  mode: 'paper' | 'live';
  killSwitchActive: boolean;
  onSymbolChange: (symbol: string) => void;
  onStrategyChange: (strategyId: string | null) => void;
  onModeToggle: () => void;
  onKillSwitch: () => void;
}

export function HeaderBar({
  symbols,
  strategies,
  currentSymbol,
  currentStrategy,
  mode,
  killSwitchActive,
  onSymbolChange,
  onStrategyChange,
  onModeToggle,
  onKillSwitch,
}: HeaderBarProps) {
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [time, setTime] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 border-b bg-background flex items-center px-4 gap-4">
      {/* Logo */}
      <div className="font-bold text-lg">📈</div>

      {/* Symbol Selector */}
      <Select value={currentSymbol} onValueChange={onSymbolChange}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {symbols.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Strategy Selector */}
      <Select
        value={currentStrategy || 'all'}
        onValueChange={(v) => onStrategyChange(v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All Strategies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Strategies</SelectItem>
          {strategies.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
              <Badge variant={s.enabled ? 'default' : 'secondary'} className="ml-2">
                {s.current_state}
              </Badge>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Mode Badge */}
      <Badge
        variant={mode === 'paper' ? 'outline' : 'destructive'}
        className={cn(
          "cursor-pointer transition-all",
          mode === 'live' && "animate-pulse"
        )}
        onClick={onModeToggle}
      >
        {mode === 'paper' ? '🟢 PAPER' : '🔴 LIVE'}
      </Badge>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clock */}
      <div className="font-mono text-sm text-muted-foreground">
        ⏱ {time.toLocaleTimeString()}
      </div>

      {/* Kill Switch */}
      <Button
        variant={killSwitchActive ? 'destructive' : 'outline'}
        size="sm"
        onClick={() => setShowKillConfirm(true)}
        className={cn(killSwitchActive && "animate-pulse")}
      >
        🔴 {killSwitchActive ? 'KILL ACTIVE' : 'Kill Switch'}
      </Button>

      {/* Kill Switch Confirmation */}
      <AlertDialog open={showKillConfirm} onOpenChange={setShowKillConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {killSwitchActive ? 'Deactivate Kill Switch?' : 'Activate Kill Switch?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {killSwitchActive
                ? 'This will resume normal trading operations.'
                : 'This will immediately stop all trading and optionally close open positions.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onKillSwitch}>
              {killSwitchActive ? 'Resume Trading' : 'STOP ALL TRADING'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings & Profile */}
      <Button variant="ghost" size="icon">⚙️</Button>
      <Button variant="ghost" size="icon">👤</Button>
    </header>
  );
}
```

---

### 2. Chart Panel (Panel Principal - 60% del espacio)

El corazón del workbench. Gráfico de velas interactivo con overlays de señales.

**Características:**
- Candlestick chart estilo TradingView
- Timeframes: 1m, 5m, 15m, 1h, 4h, 1d
- Overlays:
  - Niveles de entrada/salida (líneas horizontales)
  - TP/SL targets
  - Marcadores de señales (LONG/SHORT)
  - Eventos de whales (iconos)
  - Trades ejecutados (flechas)
- Zoom y pan
- Crosshair con precio/tiempo

**Librería recomendada:** `lightweight-charts` (TradingView) o `react-financial-charts`

```tsx
// components/workbench/chart-panel.tsx
'use client';

import { useEffect, useRef, memo } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketData } from '~/lib/hooks/trading/use-market-data';
import { useSignals } from '~/lib/hooks/trading/use-signals';
import { usePositions } from '~/lib/hooks/trading/use-positions';

interface ChartPanelProps {
  symbol: string;
  timeframe: string;
  strategyId?: string;
}

export const ChartPanel = memo(function ChartPanel({
  symbol,
  timeframe,
  strategyId
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const { candles, isLoading } = useMarketData(symbol, timeframe);
  const { signals } = useSignals(strategyId);
  const { position } = usePositions(strategyId, symbol);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: 'hsl(var(--foreground))',
      },
      grid: {
        vertLines: { color: 'hsl(var(--border))' },
        horzLines: { color: 'hsl(var(--border))' },
      },
      crosshair: {
        mode: 1, // Magnet mode
      },
      rightPriceScale: {
        borderColor: 'hsl(var(--border))',
      },
      timeScale: {
        borderColor: 'hsl(var(--border))',
        timeVisible: true,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: 'hsl(142 76% 36%)',      // --profit
      downColor: 'hsl(0 84% 60%)',       // --loss
      borderUpColor: 'hsl(142 76% 36%)',
      borderDownColor: 'hsl(0 84% 60%)',
      wickUpColor: 'hsl(142 76% 36%)',
      wickDownColor: 'hsl(0 84% 60%)',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle resize
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || !candles.length) return;

    candleSeriesRef.current.setData(candles.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })));
  }, [candles]);

  // Draw position levels
  useEffect(() => {
    if (!chartRef.current || !position?.is_open) return;

    // Entry line
    const entryLine = candleSeriesRef.current?.createPriceLine({
      price: position.avg_entry_price,
      color: 'hsl(var(--primary))',
      lineWidth: 2,
      lineStyle: 0, // Solid
      axisLabelVisible: true,
      title: 'Entry',
    });

    // TP line
    const tpLine = position.take_profit_price && candleSeriesRef.current?.createPriceLine({
      price: position.take_profit_price,
      color: 'hsl(142 76% 36%)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'TP',
    });

    // SL line
    const slLine = position.stop_loss_price && candleSeriesRef.current?.createPriceLine({
      price: position.stop_loss_price,
      color: 'hsl(0 84% 60%)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'SL',
    });

    return () => {
      if (entryLine) candleSeriesRef.current?.removePriceLine(entryLine);
      if (tpLine) candleSeriesRef.current?.removePriceLine(tpLine);
      if (slLine) candleSeriesRef.current?.removePriceLine(slLine);
    };
  }, [position]);

  // Draw signal markers
  useEffect(() => {
    if (!candleSeriesRef.current || !signals.length) return;

    const markers = signals
      .filter(s => s.setup !== 'NONE')
      .map(s => ({
        time: Math.floor(new Date(s.ts).getTime() / 1000) as any,
        position: s.setup === 'LONG' ? 'belowBar' : 'aboveBar',
        color: s.setup === 'LONG' ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)',
        shape: s.setup === 'LONG' ? 'arrowUp' : 'arrowDown',
        text: s.setup,
      }));

    candleSeriesRef.current.setMarkers(markers as any);
  }, [signals]);

  return (
    <div className="relative w-full h-full">
      {/* Timeframe selector */}
      <div className="absolute top-2 left-2 z-10 flex gap-1">
        {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
          <button
            key={tf}
            className={cn(
              "px-2 py-1 text-xs rounded",
              tf === timeframe
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin">⏳</div>
        </div>
      )}
    </div>
  );
});
```

---

### 3. Signal & Position Panel (Panel Derecho - 25% del espacio)

Panel lateral con toda la información de estado actual.

```
┌─────────────────────────────────┐
│  SIGNALS & SCORES               │
│  ─────────────────────────────  │
│  Setup: LONG ⬆                  │
│  ─────────────────────────────  │
│  Flush:      ████████░░ 82%     │
│  Burst:      ███████░░░ 74%     │
│  Absorption: ██████░░░░ 63%     │
│  Momentum:   ████░░░░░░ 45%     │
│  ─────────────────────────────  │
│  Confirmations:                 │
│  ✓ Reclaim   ✓ Volume   ○ Whale │
│  ─────────────────────────────  │
│  Levels:                        │
│  Key Level:   $102,500          │
│  Entry:       $102,450          │
│  Stop Loss:   $101,400 (-1.0%)  │
│  Take Profit: $104,400 (+2.0%)  │
│  R:R Ratio:   2.0               │
├─────────────────────────────────┤
│  CURRENT POSITION               │
│  ─────────────────────────────  │
│  ⬆ LONG 0.025 BTC               │
│  Entry: $102,380                │
│  Current: $102,507              │
│  ─────────────────────────────  │
│  Unrealized PnL:                │
│  +$127.50 (+1.25%) 🟢           │
│  ─────────────────────────────  │
│  Duration: 00:04:32             │
│  ─────────────────────────────  │
│  [Close Position] [Modify]      │
├─────────────────────────────────┤
│  RISK BUMPERS                   │
│  ─────────────────────────────  │
│  Daily Loss:                    │
│  ████░░░░░░ $234 / $500         │
│  ─────────────────────────────  │
│  Daily Trades: 3 / 10           │
│  ─────────────────────────────  │
│  Cooldown: Not active           │
│  ─────────────────────────────  │
│  Strategy State: IN_POSITION    │
└─────────────────────────────────┘
```

**Código de componente:**

```tsx
// components/workbench/signal-position-panel.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Progress } from '@kit/ui/progress';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { cn } from '@kit/ui/lib/utils';
import { formatCurrency, formatPercent, formatDuration } from '~/lib/utils/formatting';

interface SignalPositionPanelProps {
  signal: Signal | null;
  position: Position | null;
  riskState: RiskBumpersState | null;
  strategyState: StrategyState;
  onClosePosition: () => void;
  onModifyPosition: () => void;
}

export function SignalPositionPanel({
  signal,
  position,
  riskState,
  strategyState,
  onClosePosition,
  onModifyPosition,
}: SignalPositionPanelProps) {
  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      {/* Signal Card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center justify-between">
            SIGNALS & SCORES
            {signal && (
              <Badge variant={signal.setup === 'LONG' ? 'default' : 'destructive'}>
                {signal.setup} {signal.setup === 'LONG' ? '⬆' : '⬇'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {signal ? (
            <>
              {/* Score Bars */}
              <div className="space-y-2">
                <ScoreBar label="Flush" value={signal.scores.flush} />
                <ScoreBar label="Burst" value={signal.scores.burst} />
                <ScoreBar label="Absorption" value={signal.scores.absorption} />
                <ScoreBar label="Momentum" value={signal.scores.momentum} />
              </div>

              {/* Confirmations */}
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">Confirmations:</p>
                <div className="flex gap-2 flex-wrap">
                  <ConfirmationBadge
                    label="Reclaim"
                    active={signal.confirmations.reclaim}
                  />
                  <ConfirmationBadge
                    label="Volume"
                    active={signal.confirmations.volume_spike}
                  />
                  <ConfirmationBadge
                    label="Whale"
                    active={signal.confirmations.whale_event}
                  />
                </div>
              </div>

              {/* Levels */}
              <div className="border-t pt-3 space-y-1">
                <LevelRow label="Key Level" value={signal.levels.key_level} />
                <LevelRow label="Entry" value={signal.levels.entry_price} />
                <LevelRow
                  label="Stop Loss"
                  value={signal.levels.stop_loss}
                  variant="loss"
                  percent={-1.0}
                />
                <LevelRow
                  label="Take Profit"
                  value={signal.levels.take_profit}
                  variant="profit"
                  percent={2.0}
                />
                <div className="flex justify-between text-sm font-medium pt-1">
                  <span>R:R Ratio</span>
                  <span>2.0</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No active signal</p>
          )}
        </CardContent>
      </Card>

      {/* Position Card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">CURRENT POSITION</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {position?.is_open ? (
            <div className="space-y-3">
              {/* Position Info */}
              <div className="flex items-center gap-2">
                <Badge variant={position.side === 'buy' ? 'default' : 'destructive'}>
                  {position.side === 'buy' ? '⬆ LONG' : '⬇ SHORT'}
                </Badge>
                <span className="font-mono">{position.qty} BTC</span>
              </div>

              {/* Prices */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry:</span>
                  <span className="font-mono">{formatCurrency(position.avg_entry_price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current:</span>
                  <span className="font-mono">{formatCurrency(position.current_price)}</span>
                </div>
              </div>

              {/* PnL */}
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">Unrealized PnL:</p>
                <p className={cn(
                  "text-2xl font-bold font-mono",
                  position.unrealized_pnl >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {position.unrealized_pnl >= 0 ? '+' : ''}
                  {formatCurrency(position.unrealized_pnl)}
                  <span className="text-sm ml-2">
                    ({formatPercent(position.unrealized_pnl / (position.avg_entry_price * position.qty) * 100)})
                  </span>
                </p>
              </div>

              {/* Duration */}
              <div className="text-sm text-muted-foreground">
                Duration: {formatDuration(position.entry_at)}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={onClosePosition}
                >
                  Close Position
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onModifyPosition}
                >
                  Modify
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No open position</p>
          )}
        </CardContent>
      </Card>

      {/* Risk Bumpers Card */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center justify-between">
            RISK BUMPERS
            <Badge variant="outline">{strategyState}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {riskState && (
            <>
              {/* Daily Loss */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Daily Loss</span>
                  <span className="font-mono">
                    ${riskState.daily_loss_usd} / $500
                  </span>
                </div>
                <Progress
                  value={(riskState.daily_loss_usd / 500) * 100}
                  className="h-2"
                />
              </div>

              {/* Daily Trades */}
              <div className="flex justify-between text-sm">
                <span>Daily Trades</span>
                <span className="font-mono">
                  {riskState.daily_trades_count} / 10
                </span>
              </div>

              {/* Cooldown */}
              <div className="flex justify-between text-sm">
                <span>Cooldown</span>
                <span className={cn(
                  riskState.cooldown_until ? "text-yellow-500" : "text-muted-foreground"
                )}>
                  {riskState.cooldown_until
                    ? formatDuration(riskState.cooldown_until)
                    : 'Not active'}
                </span>
              </div>

              {/* Kill Switch Warning */}
              {riskState.kill_switch_active && (
                <div className="bg-destructive/10 text-destructive p-2 rounded text-sm">
                  ⚠️ Kill Switch Active: {riskState.kill_switch_reason}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper Components
function ScoreBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-20 text-muted-foreground">{label}:</span>
      <Progress value={percent} className="h-2 flex-1" />
      <span className="text-xs font-mono w-10 text-right">{percent}%</span>
    </div>
  );
}

function ConfirmationBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded",
      active
        ? "bg-green-500/20 text-green-500"
        : "bg-muted text-muted-foreground"
    )}>
      {active ? '✓' : '○'} {label}
    </span>
  );
}

function LevelRow({
  label,
  value,
  variant,
  percent
}: {
  label: string;
  value: number;
  variant?: 'profit' | 'loss';
  percent?: number;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn(
        "font-mono",
        variant === 'profit' && "text-green-500",
        variant === 'loss' && "text-red-500"
      )}>
        {formatCurrency(value)}
        {percent && (
          <span className="text-xs ml-1">
            ({percent > 0 ? '+' : ''}{percent}%)
          </span>
        )}
      </span>
    </div>
  );
}
```

---

### 4. Activity Panel (Panel Inferior - 15% del espacio)

Feed de actividad en tiempo real con tabs para diferentes vistas.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [Activity] [Orders] [Trade History] [Whales] [AI Copilot]                             │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  14:32:05  🟢 Signal LONG generated (flush: 82%, burst: 74%, reclaim: true)          │
│  14:32:06  ✓ Risk engine approved intent #I-4521                                     │
│  14:32:07  📤 Order submitted: MARKET BUY 0.025 BTC/USD                              │
│  14:32:08  ✓ Order #O-8821 filled @ $102,380.50 (slippage: 0.02%)                    │
│  14:30:22  🐋 Whale "GCR" increased BTC long position by +15%                        │
│  14:28:15  ⚠️ Drift guard check: HL $102,380 vs Alpaca $102,388 (0.008%) - OK        │
│  14:25:00  📊 Strategy "Flush+Burst" state: IDLE → IN_POSITION                       │
│                                                                                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Tabs disponibles:**

| Tab | Contenido |
|-----|-----------|
| **Activity** | Feed unificado de todos los eventos |
| **Orders** | Lista de órdenes (pending, filled, cancelled) |
| **Trade History** | Trades cerrados con PnL |
| **Whales** | Watchlist y eventos de whales |
| **AI Copilot** | Chat con el agente AI |

```tsx
// components/workbench/activity-panel.tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Badge } from '@kit/ui/badge';
import { Input } from '@kit/ui/input';
import { Button } from '@kit/ui/button';
import { cn } from '@kit/ui/lib/utils';

// Activity Feed
function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 text-sm py-1.5 border-b border-border/50"
          >
            <span className="text-muted-foreground font-mono text-xs w-16">
              {new Date(event.ts).toLocaleTimeString()}
            </span>
            <span className="text-lg w-6">{getEventIcon(event.type)}</span>
            <span className={cn(
              "flex-1",
              event.severity === 'warning' && "text-yellow-500",
              event.severity === 'error' && "text-red-500",
              event.severity === 'success' && "text-green-500"
            )}>
              {event.message}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// Orders Table
function OrdersTable({ orders }: { orders: Order[] }) {
  return (
    <ScrollArea className="h-full">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr className="text-muted-foreground text-left">
            <th className="py-2 px-3">Time</th>
            <th className="py-2 px-3">Side</th>
            <th className="py-2 px-3">Type</th>
            <th className="py-2 px-3">Qty</th>
            <th className="py-2 px-3">Price</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-border/50">
              <td className="py-2 px-3 font-mono text-xs">
                {new Date(order.created_at).toLocaleTimeString()}
              </td>
              <td className="py-2 px-3">
                <Badge variant={order.side === 'buy' ? 'default' : 'destructive'}>
                  {order.side.toUpperCase()}
                </Badge>
              </td>
              <td className="py-2 px-3">{order.order_type}</td>
              <td className="py-2 px-3 font-mono">{order.qty}</td>
              <td className="py-2 px-3 font-mono">
                {order.filled_avg_price || order.limit_price || 'MARKET'}
              </td>
              <td className="py-2 px-3">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="py-2 px-3">
                {order.status === 'pending' && (
                  <Button variant="ghost" size="sm">Cancel</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

// Whales Panel
function WhalesPanel({
  whales,
  events
}: {
  whales: Whale[];
  events: WhaleEvent[];
}) {
  return (
    <div className="flex h-full">
      {/* Watchlist */}
      <div className="w-1/3 border-r">
        <div className="p-2 border-b font-medium text-sm">Watchlist</div>
        <ScrollArea className="h-[calc(100%-40px)]">
          {whales.map((whale) => (
            <div
              key={whale.id}
              className="p-2 border-b border-border/50 hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{whale.label || whale.address.slice(0, 8)}</span>
                <Badge variant={whale.status === 'active' ? 'default' : 'secondary'}>
                  {whale.status}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Score: {whale.score}
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Events */}
      <div className="flex-1">
        <div className="p-2 border-b font-medium text-sm">Recent Events</div>
        <ScrollArea className="h-[calc(100%-40px)]">
          {events.map((event) => (
            <div
              key={event.id}
              className="p-2 border-b border-border/50"
            >
              <div className="flex items-center gap-2">
                <span>🐋</span>
                <Badge variant={
                  event.event_type.includes('INCREASE') ? 'default' :
                  event.event_type.includes('DECREASE') ? 'destructive' :
                  'secondary'
                }>
                  {event.event_type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.ts).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm mt-1">
                {event.details?.description}
              </p>
            </div>
          ))}
        </ScrollArea>
      </div>
    </div>
  );
}

// AI Copilot Chat
function AICopilotChat({
  messages,
  onSendMessage
}: {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
}) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 p-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "p-2 rounded mb-2 max-w-[80%]",
              msg.role === 'user'
                ? "bg-primary text-primary-foreground ml-auto"
                : "bg-muted"
            )}
          >
            {msg.content}
          </div>
        ))}
      </ScrollArea>

      {/* Input */}
      <div className="p-2 border-t flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything about your trades..."
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <Button onClick={handleSend}>Send</Button>
      </div>
    </div>
  );
}

// Main Activity Panel Component
export function ActivityPanel() {
  const { events } = useActivityFeed();
  const { orders } = useOrders();
  const { history } = useTradeHistory();
  const { whales, whaleEvents } = useWhales();
  const { messages, sendMessage } = useAgentChat();

  return (
    <Tabs defaultValue="activity" className="h-full flex flex-col">
      <TabsList className="border-b rounded-none justify-start px-2">
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="orders">
          Orders
          {orders.filter(o => o.status === 'pending').length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {orders.filter(o => o.status === 'pending').length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="history">Trade History</TabsTrigger>
        <TabsTrigger value="whales">
          Whales
          {whaleEvents.filter(e => isRecent(e.ts)).length > 0 && (
            <Badge variant="default" className="ml-1">
              {whaleEvents.filter(e => isRecent(e.ts)).length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="copilot">AI Copilot</TabsTrigger>
      </TabsList>

      <div className="flex-1 overflow-hidden">
        <TabsContent value="activity" className="h-full m-0">
          <ActivityFeed events={events} />
        </TabsContent>

        <TabsContent value="orders" className="h-full m-0">
          <OrdersTable orders={orders} />
        </TabsContent>

        <TabsContent value="history" className="h-full m-0">
          <TradeHistoryTable trades={history} />
        </TabsContent>

        <TabsContent value="whales" className="h-full m-0">
          <WhalesPanel whales={whales} events={whaleEvents} />
        </TabsContent>

        <TabsContent value="copilot" className="h-full m-0">
          <AICopilotChat messages={messages} onSendMessage={sendMessage} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
```

---

## 📐 LAYOUT RESPONSIVO

### Desktop (>1280px)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER BAR                                                                                   │
├───────────────────────────────────────────────────────┬─────────────────────────────────────┤
│                                                        │                                     │
│                                                        │  SIGNAL & POSITION PANEL            │
│                 CHART PANEL                            │  (25% width)                        │
│                 (60% width)                            │                                     │
│                                                        │                                     │
│                                                        │                                     │
├───────────────────────────────────────────────────────┴─────────────────────────────────────┤
│ ACTIVITY PANEL (TABS) - 15% height                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Tablet (768px - 1280px)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER BAR (condensado)                                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│                              CHART PANEL (100% width)                                        │
│                                                                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ SIGNAL PANEL (horizontal scrollable cards)                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ ACTIVITY PANEL (TABS) - collapsible                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Mobile (<768px)

```
┌────────────────────────┐
│ HEADER (minimal)       │
├────────────────────────┤
│                        │
│   CHART (full width)   │
│                        │
├────────────────────────┤
│ [Chart][Signal][Orders]│  ← Bottom tabs
└────────────────────────┘
```

---

## 🎨 SISTEMA DE COLORES TRADING

```css
/* globals.css additions */
:root {
  /* Trading Colors */
  --profit: 142 76% 36%;        /* Verde para ganancias */
  --profit-foreground: 0 0% 100%;
  --loss: 0 84% 60%;            /* Rojo para pérdidas */
  --loss-foreground: 0 0% 100%;
  --warning: 38 92% 50%;        /* Amarillo para alertas */
  --warning-foreground: 0 0% 0%;

  /* Signal Colors */
  --signal-long: 142 76% 36%;   /* Verde para LONG */
  --signal-short: 0 84% 60%;    /* Rojo para SHORT */
  --signal-neutral: 220 14% 46%;

  /* Chart Colors */
  --chart-candle-up: 142 76% 36%;
  --chart-candle-down: 0 84% 60%;
  --chart-line-tp: 142 76% 36%;
  --chart-line-sl: 0 84% 60%;
  --chart-line-entry: 220 14% 96%;

  /* Whale Events */
  --whale-increase: 142 76% 36%;
  --whale-decrease: 0 84% 60%;
  --whale-neutral: 38 92% 50%;
}

.dark {
  /* Dark mode adjustments for better visibility */
  --profit: 142 70% 45%;
  --loss: 0 80% 55%;
}
```

---

## 🔄 FLUJOS DE DATOS EN TIEMPO REAL

### Supabase Realtime Subscriptions

```tsx
// lib/hooks/realtime/use-workbench-realtime.ts
'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

export function useWorkbenchRealtime(strategyId?: string) {
  const queryClient = useQueryClient();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    // Subscribe to signals
    const signalsChannel = supabase
      .channel('signals-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signals',
          filter: strategyId ? `strategy_id=eq.${strategyId}` : undefined,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['signals'] });
          queryClient.setQueryData(['latest-signal'], payload.new);
        }
      )
      .subscribe();

    // Subscribe to orders
    const ordersChannel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
      )
      .subscribe();

    // Subscribe to positions
    const positionsChannel = supabase
      .channel('positions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['positions'] });
        }
      )
      .subscribe();

    // Subscribe to risk events
    const riskChannel = supabase
      .channel('risk-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'risk_events',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['risk-events'] });
          // Show toast notification for critical events
          if (payload.new.severity === 'critical' || payload.new.severity === 'fatal') {
            toast.error(payload.new.message);
          }
        }
      )
      .subscribe();

    // Subscribe to whale events
    const whaleChannel = supabase
      .channel('whale-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whale_events',
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['whale-events'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(signalsChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(riskChannel);
      supabase.removeChannel(whaleChannel);
    };
  }, [supabase, queryClient, strategyId]);
}
```

---

## 📦 ESTRUCTURA DE COMPONENTES ACTUALIZADA

El plan original tenía páginas separadas. Ahora consolidamos en un workbench:

```
apps/web/
├── app/
│   └── home/
│       └── workbench/                    # NUEVO - Ruta única del workbench
│           ├── page.tsx                  # Trading Workbench principal
│           └── layout.tsx                # Layout sin sidebar (full screen)
│
└── components/
    └── workbench/                        # NUEVO - Componentes del workbench
        ├── trading-workbench.tsx         # Container principal
        ├── header-bar.tsx                # Header con selectores
        ├── chart-panel.tsx               # Gráfico de velas
        ├── signal-position-panel.tsx     # Panel lateral derecho
        ├── activity-panel.tsx            # Panel inferior con tabs
        ├── activity-feed.tsx             # Feed de actividad
        ├── orders-table.tsx              # Tabla de órdenes
        ├── trade-history-table.tsx       # Historial de trades
        ├── whales-panel.tsx              # Panel de whales
        ├── ai-copilot-chat.tsx           # Chat con AI
        ├── close-position-dialog.tsx     # Modal cerrar posición
        ├── modify-position-dialog.tsx    # Modal modificar TP/SL
        └── kill-switch-dialog.tsx        # Modal kill switch
```

---

## 🎯 COMPONENTE PRINCIPAL: Trading Workbench

```tsx
// app/home/workbench/page.tsx
import { TradingWorkbench } from '~/components/workbench/trading-workbench';

export default function WorkbenchPage() {
  return <TradingWorkbench />;
}

// app/home/workbench/layout.tsx
export default function WorkbenchLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen w-screen overflow-hidden">
      {children}
    </div>
  );
}
```

```tsx
// components/workbench/trading-workbench.tsx
'use client';

import { useState } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@kit/ui/resizable';
import { HeaderBar } from './header-bar';
import { ChartPanel } from './chart-panel';
import { SignalPositionPanel } from './signal-position-panel';
import { ActivityPanel } from './activity-panel';
import { useWorkbenchRealtime } from '~/lib/hooks/realtime/use-workbench-realtime';
import { useStrategies } from '~/lib/hooks/strategies/use-strategies';
import { useLatestSignal } from '~/lib/hooks/trading/use-signals';
import { useOpenPosition } from '~/lib/hooks/trading/use-positions';
import { useRiskState } from '~/lib/hooks/risk/use-risk-state';
import { useKillSwitch } from '~/lib/hooks/risk/use-kill-switch';

const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD'];

export function TradingWorkbench() {
  // State
  const [currentSymbol, setCurrentSymbol] = useState('BTC/USD');
  const [currentStrategy, setCurrentStrategy] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState('5m');

  // Data hooks
  const { strategies } = useStrategies();
  const { signal } = useLatestSignal(currentStrategy);
  const { position } = useOpenPosition(currentStrategy, currentSymbol);
  const { riskState } = useRiskState(currentStrategy);
  const { killSwitchActive, toggleKillSwitch } = useKillSwitch();

  // Get current strategy state
  const currentStrategyData = strategies?.find(s => s.id === currentStrategy);
  const strategyState = currentStrategyData?.current_state || 'IDLE';
  const mode = currentStrategyData?.mode || 'paper';

  // Realtime subscriptions
  useWorkbenchRealtime(currentStrategy);

  // Handlers
  const handleClosePosition = async () => {
    // Implementation
  };

  const handleModifyPosition = async () => {
    // Implementation
  };

  const handleModeToggle = async () => {
    // Implementation with confirmation
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Header */}
      <HeaderBar
        symbols={SYMBOLS}
        strategies={strategies || []}
        currentSymbol={currentSymbol}
        currentStrategy={currentStrategy}
        mode={mode}
        killSwitchActive={killSwitchActive}
        onSymbolChange={setCurrentSymbol}
        onStrategyChange={setCurrentStrategy}
        onModeToggle={handleModeToggle}
        onKillSwitch={toggleKillSwitch}
      />

      {/* Main Content */}
      <ResizablePanelGroup direction="vertical" className="flex-1">
        {/* Top Section: Chart + Signal Panel */}
        <ResizablePanel defaultSize={85} minSize={50}>
          <ResizablePanelGroup direction="horizontal">
            {/* Chart */}
            <ResizablePanel defaultSize={75} minSize={40}>
              <ChartPanel
                symbol={currentSymbol}
                timeframe={timeframe}
                strategyId={currentStrategy}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Signal & Position Panel */}
            <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
              <SignalPositionPanel
                signal={signal}
                position={position}
                riskState={riskState}
                strategyState={strategyState}
                onClosePosition={handleClosePosition}
                onModifyPosition={handleModifyPosition}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Bottom Section: Activity Panel */}
        <ResizablePanel defaultSize={15} minSize={10} maxSize={40}>
          <ActivityPanel strategyId={currentStrategy} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
```

---

## ✅ VALIDACIÓN: ¿El Plan Cubre Todo?

### Datos Disponibles en el Workbench

| Dato | Fuente (Tabla) | Panel | Realtime |
|------|----------------|-------|----------|
| Candlestick chart | `market_data_cache` | Chart | ✅ |
| Señales (scores) | `signals` | Signal Panel | ✅ |
| Confirmaciones | `signals.confirmations_json` | Signal Panel | ✅ |
| Niveles TP/SL | `signals.levels_json` | Signal Panel + Chart | ✅ |
| Posición actual | `positions` | Position Panel | ✅ |
| PnL unrealized | `positions.unrealized_pnl` | Position Panel | ✅ |
| Risk bumpers | `risk_bumpers_state` | Risk Panel | ✅ |
| Órdenes | `orders` | Activity > Orders | ✅ |
| Fills | `fills` | Activity > Orders | ✅ |
| Trade history | `positions` (closed) | Activity > History | ✅ |
| Whale watchlist | `whale_watchlist` | Activity > Whales | ✅ |
| Whale events | `whale_events` | Activity > Whales | ✅ |
| AI Chat | `agent_traces` | Activity > Copilot | ✅ |
| Strategy state | `strategies.current_state` | Header + Panel | ✅ |
| Kill switch | `risk_bumpers_state` | Header | ✅ |

### Filtros Disponibles

| Filtro | Ubicación | Afecta a |
|--------|-----------|----------|
| Symbol | Header | Chart, Signals, Position |
| Strategy | Header | Todo |
| Timeframe | Chart | Solo chart |
| Tab selection | Activity Panel | Panel inferior |

### Acciones Disponibles

| Acción | Ubicación | Destino |
|--------|-----------|---------|
| Cambiar símbolo | Header | Todo |
| Cambiar estrategia | Header | Todo |
| Toggle Paper/Live | Header | Mode de ejecución |
| Kill Switch | Header | Detener trading |
| Close Position | Position Panel | Alpaca API |
| Modify TP/SL | Position Panel | Supabase + Alpaca |
| Cancel Order | Orders Tab | Alpaca API |
| Send AI Message | Copilot Tab | Agent Orchestrator |

---

## 📊 COMPARACIÓN: Plan Original vs Workbench

### Plan Original (Páginas Separadas)

```
/home/trading/           → Dashboard overview
/home/trading/signals/   → Signals page
/home/trading/positions/ → Positions page
/home/trading/orders/    → Orders page
/home/trading/performance/ → Performance page
/home/whales/            → Whale watchlist
/home/risk/              → Risk dashboard
/home/agents/chat/       → AI Copilot
```

**Problema:** El trader debe navegar entre 8+ páginas para obtener toda la información.

### Workbench Consolidado

```
/home/workbench/         → TODO en una sola vista
```

**Solución:** Una sola página con paneles redimensionables que muestra:
- Chart + señales + niveles (visual)
- Posición + PnL + riesgo (estado)
- Órdenes + historial + whales + AI (actividad)

---

## 🔧 DEPENDENCIAS ADICIONALES

Agregar al `package.json` de `apps/web`:

```json
{
  "dependencies": {
    "lightweight-charts": "^4.1.0",
    "@radix-ui/react-resizable": "^1.0.0",
    "react-virtuoso": "^4.6.0"
  }
}
```

---

## 📝 CONCLUSIÓN

### El Workbench Garantiza:

1. **✅ Todo en una sola ventana** - No hay necesidad de cambiar de página
2. **✅ Tiempo real** - Supabase Realtime para todos los datos críticos
3. **✅ Chart profesional** - Candlestick con overlays de señales, TP/SL, trades
4. **✅ Filtros por símbolo/estrategia** - En el header, afecta todo
5. **✅ Whales integrados** - Tab en el panel inferior + eventos en chart
6. **✅ AI Copilot accesible** - Tab en el panel inferior
7. **✅ Control de riesgo visible** - Panel lateral + kill switch en header
8. **✅ Paneles redimensionables** - El trader puede ajustar el layout

### Actualización al Plan de Trabajo

El Sprint 7 (Frontend Base) ahora se enfoca en el **Trading Workbench** en lugar de páginas separadas. Esto simplifica:
- Menos rutas a crear
- Menos navegación
- Mejor experiencia de trader
- Más código compartido entre paneles

---

## 🚀 PRÓXIMOS PASOS

1. **Agregar al plan de trabajo** la nueva estructura de workbench
2. **Crear wireframes interactivos** (Figma) para validar con el usuario
3. **Implementar chart primero** - Es el componente más crítico
4. **Iterar sobre feedback** - El layout puede ajustarse

'use client';

/**
 * Paper Orders List - Display simulated trading positions
 * Shows open and closed paper trades with P&L tracking
 */

import { useState } from 'react';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  X,
  Target,
  Shield,
  Activity,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@kit/ui/utils';
import type { PaperOrder, PaperOrderExitReason } from '@kit/trading-core';

// ============================================================================
// TYPES
// ============================================================================

// Simplified stats type that matches what API returns
interface PaperStatsData {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_win?: number;
  avg_loss?: number;
  profit_factor?: number;
  max_drawdown?: number;
  pattern_stats?: Record<string, { trades: number; wins: number; total_pnl: number; avg_pnl: number }>;
  current_streak: number;
  best_streak?: number;
  worst_streak?: number;
}

interface Props {
  orders: PaperOrder[];
  stats: PaperStatsData | null;
  currentPrices?: Record<string, number>;
  onCloseOrder?: (orderId: string, exitPrice: number, reason: PaperOrderExitReason) => void;
  onDeleteOrder?: (orderId: string) => void;
  isLoading?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '$0.00';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0.00%';
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function formatPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDays}d ago`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'open':
      return <Badge variant="default" className="text-[8px]">OPEN</Badge>;
    case 'closed_tp':
      return <Badge className="text-[8px] bg-green-500">TP HIT</Badge>;
    case 'closed_sl':
      return <Badge variant="destructive" className="text-[8px]">SL HIT</Badge>;
    case 'closed_manual':
      return <Badge variant="secondary" className="text-[8px]">MANUAL</Badge>;
    case 'expired':
      return <Badge variant="outline" className="text-[8px]">EXPIRED</Badge>;
    default:
      return <Badge variant="outline" className="text-[8px]">{status}</Badge>;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PaperOrdersList({
  orders,
  stats,
  currentPrices = {},
  onCloseOrder,
  onDeleteOrder,
  isLoading,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    if (filter === 'open') return order.status === 'open';
    if (filter === 'closed') return order.status !== 'open';
    return true;
  });

  const openOrders = orders.filter((o) => o.status === 'open');
  const closedOrders = orders.filter((o) => o.status !== 'open');

  // Calculate unrealized P&L for open orders
  const calculateUnrealizedPnL = (order: PaperOrder): { pnlUsd: number; pnlPct: number } => {
    const currentPrice = currentPrices[order.symbol];
    if (!currentPrice) return { pnlUsd: 0, pnlPct: 0 };

    const entryPrice = typeof order.entry_price === 'string' ? parseFloat(order.entry_price) : order.entry_price;
    const sizeUsd = typeof order.size_usd === 'string' ? parseFloat(order.size_usd) : order.size_usd;

    let pnlPct: number;
    if (order.side === 'LONG') {
      pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100;
    }

    const pnlUsd = (pnlPct / 100) * sizeUsd;
    return { pnlUsd, pnlPct };
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-4 gap-2 p-2 border-b text-[9px]">
          <div className="text-center">
            <div className="text-muted-foreground">Total P&L</div>
            <div className={cn('font-mono font-semibold', stats.total_pnl >= 0 ? 'text-green-500' : 'text-red-500')}>
              {formatCurrency(stats.total_pnl)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Win Rate</div>
            <div className="font-mono font-semibold">{stats.win_rate.toFixed(1)}%</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Trades</div>
            <div className="font-mono">
              <span className="text-green-500">{stats.winning_trades}W</span>
              <span className="mx-0.5">/</span>
              <span className="text-red-500">{stats.losing_trades}L</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Streak</div>
            <div className={cn('font-mono', stats.current_streak > 0 ? 'text-green-500' : stats.current_streak < 0 ? 'text-red-500' : '')}>
              {stats.current_streak > 0 ? `+${stats.current_streak}` : stats.current_streak}
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="px-2 py-1 border-b shrink-0">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'open' | 'closed')}>
          <TabsList className="h-6">
            <TabsTrigger value="all" className="text-[9px] h-5 px-2">
              All ({orders.length})
            </TabsTrigger>
            <TabsTrigger value="open" className="text-[9px] h-5 px-2">
              <Activity className="h-3 w-3 mr-1" />
              Open ({openOrders.length})
            </TabsTrigger>
            <TabsTrigger value="closed" className="text-[9px] h-5 px-2">
              Closed ({closedOrders.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Empty State */}
      {filteredOrders.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <Activity className="h-6 w-6 mb-1 opacity-50" />
          <p className="text-[10px]">No paper orders</p>
          <p className="text-[9px] mt-1">Simulate a trade from an alert</p>
        </div>
      )}

      {/* Orders List */}
      <ScrollArea className="flex-1">
        {filteredOrders.map((order) => {
          const isOpen = order.status === 'open';
          const { pnlUsd, pnlPct } = isOpen
            ? calculateUnrealizedPnL(order)
            : { pnlUsd: order.realized_pnl || 0, pnlPct: order.realized_pnl_pct || 0 };
          const currentPrice = currentPrices[order.symbol];
          const isExpanded = expandedId === order.id;

          return (
            <div
              key={order.id}
              className={cn(
                'border-b px-2 py-1.5 cursor-pointer hover:bg-muted/30 transition-colors',
                isOpen && 'bg-primary/5'
              )}
              onClick={() => setExpandedId(isExpanded ? null : order.id)}
            >
              {/* Order Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {order.side === 'LONG' ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  <Badge
                    variant={order.side === 'LONG' ? 'default' : 'destructive'}
                    className="text-[8px] px-1 py-0 h-3"
                  >
                    {order.side}
                  </Badge>
                  <span className="text-[11px] font-semibold">{order.symbol}</span>
                  {getStatusBadge(order.status)}
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn('font-mono text-[10px] font-semibold', pnlUsd >= 0 ? 'text-green-500' : 'text-red-500')}>
                    {formatCurrency(pnlUsd)} ({formatPct(pnlPct)})
                  </div>
                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>
              </div>

              {/* Order Summary */}
              <div className="flex items-center gap-3 mt-0.5 text-[9px] text-muted-foreground">
                <span>Entry: {formatPrice(order.entry_price)}</span>
                {isOpen && currentPrice && (
                  <span>Current: {formatPrice(currentPrice)}</span>
                )}
                {!isOpen && order.exit_price && (
                  <span>Exit: {formatPrice(order.exit_price)}</span>
                )}
                <span>Size: {formatCurrency(order.size_usd)}</span>
                <span>{formatTimeAgo(order.created_at)}</span>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-2 space-y-1.5 text-[9px]">
                  {/* Risk Levels */}
                  <div className="flex items-center gap-4 p-1.5 bg-muted/30 rounded">
                    {order.stop_loss && (
                      <div className="flex items-center gap-1">
                        <Shield className="h-3 w-3 text-red-400" />
                        <span className="text-muted-foreground">SL:</span>
                        <span className="font-mono text-red-500">{formatPrice(order.stop_loss)}</span>
                      </div>
                    )}
                    {order.take_profit && (
                      <div className="flex items-center gap-1">
                        <Target className="h-3 w-3 text-green-400" />
                        <span className="text-muted-foreground">TP:</span>
                        <span className="font-mono text-green-500">{formatPrice(order.take_profit)}</span>
                      </div>
                    )}
                  </div>

                  {/* Multiple TP Targets */}
                  {order.take_profit_targets && order.take_profit_targets.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {order.take_profit_targets.map((tp, i) => (
                        <Badge key={i} variant="outline" className="text-[8px] text-green-500 border-green-500/30">
                          TP{i + 1}: {formatPrice(tp.price)} @ {tp.size_pct}%
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Agent Info */}
                  {order.pattern_type && (
                    <div className="text-muted-foreground">
                      <span>Pattern: </span>
                      <Badge variant="outline" className="text-[8px]">{order.pattern_type}</Badge>
                      {order.agent_confidence && (
                        <span className="ml-2">Confidence: {(order.agent_confidence * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  )}

                  {/* Thesis */}
                  {order.thesis_title && (
                    <div className="text-muted-foreground">
                      <span className="font-medium">{order.thesis_title}</span>
                    </div>
                  )}

                  {/* Exit Info (for closed orders) */}
                  {!isOpen && order.exit_reason && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Closed: {order.exit_reason.replace('_', ' ').toUpperCase()}</span>
                      {order.exit_time && <span>at {new Date(order.exit_time).toLocaleString()}</span>}
                    </div>
                  )}

                  {/* Actions */}
                  {isOpen && (
                    <div className="flex gap-1 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (currentPrice && onCloseOrder) {
                            onCloseOrder(order.id, currentPrice, 'manual');
                          }
                        }}
                        disabled={!currentPrice}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Close Manual
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteOrder?.(order.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  )}

                  {!isOpen && (
                    <div className="flex gap-1 pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteOrder?.(order.id);
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}

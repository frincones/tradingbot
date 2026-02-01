'use client';

/**
 * Trade Metrics Card
 * Displays key trade volume and size metrics
 */

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import type { AllKPIs } from '@kit/trading-core';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';

interface TradeMetricsCardProps {
  kpis: AllKPIs;
}

export function TradeMetricsCard({ kpis }: TradeMetricsCardProps) {
  const { trades } = kpis;

  if (!trades) {
    return null;
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Trade Metrics
          <Badge variant="secondary">{trades.open_trades} Open</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Volume Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Today</p>
            <p className="text-2xl font-bold">{trades.trades_today}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">This Week</p>
            <p className="text-2xl font-bold">{trades.trades_this_week}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">This Month</p>
            <p className="text-2xl font-bold">{trades.trades_this_month}</p>
          </div>
        </div>

        {/* Size Metrics */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Volume</span>
            <span className="font-semibold">{formatCurrency(trades.total_volume_usd)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Avg Position Size</span>
            <span className="font-semibold">{formatCurrency(trades.avg_position_size_usd)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Max Position Size</span>
            <span className="font-semibold">{formatCurrency(trades.max_position_size_usd)}</span>
          </div>
        </div>

        {/* Long/Short Distribution */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpIcon className="h-4 w-4 text-green-500" />
              <span className="text-sm">Long</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{trades.long_count}</span>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                {((trades.long_count / Math.max(trades.total_trades, 1)) * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownIcon className="h-4 w-4 text-red-500" />
              <span className="text-sm">Short</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{trades.short_count}</span>
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                {((trades.short_count / Math.max(trades.total_trades, 1)) * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Long/Short Ratio</span>
              <span className="font-semibold">{trades.long_short_ratio.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Hold Time Stats */}
        <div className="space-y-2 pt-4 border-t">
          <h4 className="text-sm font-medium">Hold Time</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Min</p>
              <p className="text-sm font-semibold">{formatMinutes(trades.min_hold_time_minutes)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg</p>
              <p className="text-sm font-semibold">{formatMinutes(trades.avg_hold_time_minutes)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Max</p>
              <p className="text-sm font-semibold">{formatMinutes(trades.max_hold_time_minutes)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

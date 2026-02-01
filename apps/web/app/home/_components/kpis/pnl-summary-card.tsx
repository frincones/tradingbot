'use client';

/**
 * P&L Summary Card
 * Displays profit/loss metrics and win rate statistics
 */

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import type { AllKPIs } from '@kit/trading-core';
import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react';

interface PnLSummaryCardProps {
  kpis: AllKPIs;
}

export function PnLSummaryCard({ kpis }: PnLSummaryCardProps) {
  const { pnl } = kpis;

  if (!pnl) {
    return null;
  }

  const formatCurrency = (value: number, showSign = true) => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(value));

    if (!showSign) {
      return formatted;
    }

    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const totalPnL = pnl.total_realized_pnl_usd + pnl.total_unrealized_pnl_usd;
  const isProfitable = totalPnL >= 0;
  const winLossRatio = pnl.avg_loss_usd !== 0
    ? Math.abs(pnl.avg_win_usd / pnl.avg_loss_usd)
    : pnl.avg_win_usd;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          P&L Summary
          <Badge variant={isProfitable ? 'default' : 'destructive'} className="gap-1">
            {isProfitable ? (
              <TrendingUpIcon className="h-3 w-3" />
            ) : (
              <TrendingDownIcon className="h-3 w-3" />
            )}
            {formatCurrency(totalPnL)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Realized P&L Breakdown */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Realized P&L</span>
            <span className={`font-semibold ${pnl.total_realized_pnl_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(pnl.total_realized_pnl_usd)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Unrealized P&L</span>
            <span className={`font-semibold ${pnl.total_unrealized_pnl_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(pnl.total_unrealized_pnl_usd)}
            </span>
          </div>
          <div className="pt-2 border-t">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Today</p>
                <p className={`text-sm font-semibold ${pnl.realized_pnl_today >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(pnl.realized_pnl_today)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Week</p>
                <p className={`text-sm font-semibold ${pnl.realized_pnl_this_week >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(pnl.realized_pnl_this_week)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Month</p>
                <p className={`text-sm font-semibold ${pnl.realized_pnl_this_month >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(pnl.realized_pnl_this_month)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Win Rate & Profit Factor */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
            <p className="text-3xl font-bold text-green-600">{pnl.win_rate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {pnl.winning_trades}W / {pnl.losing_trades}L
            </p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Profit Factor</p>
            <p className={`text-3xl font-bold ${pnl.profit_factor >= 1.5 ? 'text-green-600' : 'text-orange-500'}`}>
              {pnl.profit_factor.toFixed(2)}x
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {pnl.closed_trades} closed trades
            </p>
          </div>
        </div>

        {/* Win/Loss Analysis */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Win/Loss Analysis</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Avg Win</p>
              <p className="text-lg font-semibold text-green-600">
                {formatCurrency(pnl.avg_win_usd, false)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Loss</p>
              <p className="text-lg font-semibold text-red-600">
                {formatCurrency(pnl.avg_loss_usd, false)}
              </p>
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm text-muted-foreground">Win/Loss Ratio</span>
            <span className="font-semibold">{winLossRatio.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Expectancy</span>
            <span className={`font-semibold ${pnl.expectancy_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(pnl.expectancy_usd)}
            </span>
          </div>
        </div>

        {/* MFE/MAE */}
        <div className="space-y-2 pt-4 border-t">
          <h4 className="text-sm font-medium">Excursion Analysis</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Avg MFE</p>
              <p className="text-sm font-semibold text-green-600">
                {formatCurrency(pnl.avg_mfe_usd, false)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg MAE</p>
              <p className="text-sm font-semibold text-red-600">
                {formatCurrency(pnl.avg_mae_usd, false)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

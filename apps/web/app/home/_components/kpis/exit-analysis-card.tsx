'use client';

/**
 * Exit Analysis Card
 * Displays exit reason distribution and effectiveness
 */

import { Card, CardContent } from '@kit/ui/card';
import type { AllKPIs } from '@kit/trading-core';
import { CircleStopIcon, TargetIcon, HandIcon, TimerOffIcon } from 'lucide-react';

interface ExitAnalysisCardProps {
  kpis: AllKPIs;
}

export function ExitAnalysisCard({ kpis }: ExitAnalysisCardProps) {
  const { pnl } = kpis;

  if (!pnl) {
    return null;
  }

  const totalExits =
    pnl.sl_exits + pnl.tp_exits + pnl.manual_exits + pnl.expired_exits;

  const getPercentage = (count: number) => {
    if (totalExits === 0) return 0;
    return ((count / totalExits) * 100).toFixed(1);
  };

  const exitReasons = [
    {
      icon: CircleStopIcon,
      label: 'Stop Loss',
      count: pnl.sl_exits,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    {
      icon: TargetIcon,
      label: 'Take Profit',
      count: pnl.tp_exits,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      icon: HandIcon,
      label: 'Manual',
      count: pnl.manual_exits,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      icon: TimerOffIcon,
      label: 'Expired',
      count: pnl.expired_exits,
      color: 'text-gray-500',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
    },
  ];

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        {totalExits === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No exit data available yet</p>
          </div>
        ) : (
          <>
            {/* Total Exits */}
            <div className="text-center pb-4 border-b">
              <p className="text-sm text-muted-foreground">Total Exits</p>
              <p className="text-4xl font-bold">{totalExits}</p>
            </div>

            {/* Exit Reasons Grid */}
            <div className="grid grid-cols-2 gap-4">
              {exitReasons.map((reason) => {
                const Icon = reason.icon;
                const percentage = getPercentage(reason.count);

                return (
                  <div
                    key={reason.label}
                    className={`p-4 rounded-lg border-2 ${reason.bgColor} ${reason.borderColor}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Icon className={`h-5 w-5 ${reason.color}`} />
                      <span className="text-2xl font-bold">{reason.count}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{reason.label}</p>
                      <p className="text-xs text-muted-foreground">{percentage}% of exits</p>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden">
                      <div
                        className={`h-full ${reason.color.replace('text', 'bg')} transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Exit Effectiveness */}
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-3">Exit Effectiveness</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">SL to TP Ratio</span>
                  <span className="font-semibold">
                    1:{pnl.sl_exits > 0 ? (pnl.tp_exits / pnl.sl_exits).toFixed(2) : '0.00'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Planned Exit Rate</span>
                  <span className="font-semibold">
                    {(
                      ((pnl.sl_exits + pnl.tp_exits) / Math.max(totalExits, 1)) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Manual Intervention Rate</span>
                  <span className="font-semibold">
                    {((pnl.manual_exits / Math.max(totalExits, 1)) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Distribution */}
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Distribution</h4>
              <div className="h-8 flex rounded-lg overflow-hidden">
                {pnl.tp_exits > 0 && (
                  <div
                    className="bg-green-500"
                    style={{ width: `${getPercentage(pnl.tp_exits)}%` }}
                    title={`TP: ${getPercentage(pnl.tp_exits)}%`}
                  />
                )}
                {pnl.sl_exits > 0 && (
                  <div
                    className="bg-red-500"
                    style={{ width: `${getPercentage(pnl.sl_exits)}%` }}
                    title={`SL: ${getPercentage(pnl.sl_exits)}%`}
                  />
                )}
                {pnl.manual_exits > 0 && (
                  <div
                    className="bg-blue-500"
                    style={{ width: `${getPercentage(pnl.manual_exits)}%` }}
                    title={`Manual: ${getPercentage(pnl.manual_exits)}%`}
                  />
                )}
                {pnl.expired_exits > 0 && (
                  <div
                    className="bg-gray-400"
                    style={{ width: `${getPercentage(pnl.expired_exits)}%` }}
                    title={`Expired: ${getPercentage(pnl.expired_exits)}%`}
                  />
                )}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>Take Profit</span>
                <span>Stop Loss</span>
                <span>Manual</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

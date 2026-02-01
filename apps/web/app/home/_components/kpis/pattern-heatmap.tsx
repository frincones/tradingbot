'use client';

/**
 * Pattern Heatmap
 * Visual heatmap of pattern performance
 */

import { Card, CardContent } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import type { PatternPerformance } from '@kit/trading-core';

interface PatternHeatmapProps {
  patterns: PatternPerformance[];
}

export function PatternHeatmap({ patterns }: PatternHeatmapProps) {
  if (!patterns || patterns.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">No pattern data available yet</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number, showSign = true) => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value));

    if (!showSign) {
      return formatted;
    }

    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  // Sort patterns by P&L
  const sortedPatterns = [...patterns].sort((a, b) => b.total_pnl - a.total_pnl);

  // Find max PnL for color scaling
  const maxAbsPnL = Math.max(...patterns.map((p) => Math.abs(p.total_pnl)));

  const getColorClass = (pnl: number, isText = false) => {
    if (pnl === 0) {
      return isText ? 'text-gray-600' : 'bg-gray-100';
    }

    const intensity = Math.min(Math.abs(pnl) / maxAbsPnL, 1);

    if (pnl > 0) {
      if (intensity > 0.7) {
        return isText ? 'text-green-900' : 'bg-green-200 border-green-300';
      } else if (intensity > 0.4) {
        return isText ? 'text-green-800' : 'bg-green-100 border-green-200';
      } else {
        return isText ? 'text-green-700' : 'bg-green-50 border-green-100';
      }
    } else {
      if (intensity > 0.7) {
        return isText ? 'text-red-900' : 'bg-red-200 border-red-300';
      } else if (intensity > 0.4) {
        return isText ? 'text-red-800' : 'bg-red-100 border-red-200';
      } else {
        return isText ? 'text-red-700' : 'bg-red-50 border-red-100';
      }
    }
  };

  const formatPatternName = (pattern: string) => {
    return pattern
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        {sortedPatterns.map((pattern) => (
          <div
            key={pattern.pattern_type}
            className={`p-4 rounded-lg border-2 transition-all hover:shadow-md ${getColorClass(pattern.total_pnl)}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-sm">{formatPatternName(pattern.pattern_type)}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {pattern.total_trades} trades • {pattern.avg_hold_time_minutes.toFixed(0)}m avg hold
                </p>
              </div>
              <Badge
                variant={pattern.total_pnl >= 0 ? 'default' : 'destructive'}
                className={getColorClass(pattern.total_pnl, true)}
              >
                {formatCurrency(pattern.total_pnl)}
              </Badge>
            </div>

            <div className="grid grid-cols-4 gap-3 mt-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-sm font-semibold">{pattern.win_rate.toFixed(1)}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Avg P&L</p>
                <p className={`text-sm font-semibold ${pattern.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(pattern.avg_pnl, false)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Wins</p>
                <p className="text-sm font-semibold text-green-600">{pattern.winning_trades}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Losses</p>
                <p className="text-sm font-semibold text-red-600">{pattern.losing_trades}</p>
              </div>
            </div>

            {/* Win rate progress bar */}
            <div className="mt-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${pattern.win_rate}%` }}
                />
              </div>
            </div>
          </div>
        ))}

        {sortedPatterns.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No pattern data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

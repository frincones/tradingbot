'use client';

/**
 * KPI Dashboard
 * Main dashboard component for real-time trading KPIs
 */

import { useTradingKPIs } from '~/lib/hooks/use-trading-kpis';
import { Alert, AlertDescription } from '@kit/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { TradeMetricsCard } from './trade-metrics-card';
import { PnLSummaryCard } from './pnl-summary-card';
import { AgentPerformanceCard } from './agent-performance-card';
import { PatternHeatmap } from './pattern-heatmap';
import { ExitAnalysisCard } from './exit-analysis-card';

export function KPIDashboard() {
  const { kpis, isLoading, error, lastUpdated } = useTradingKPIs({
    autoRefresh: true,
    refreshIntervalMs: 30000, // 30 seconds
  });

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Error loading KPIs: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading && !kpis) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-muted-foreground">Loading trading KPIs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Trading Performance Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time KPIs and agent performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </Badge>
          {lastUpdated && (
            <span className="text-sm text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Top Row: Trade Metrics + P&L Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TradeMetricsCard kpis={kpis} />
        <PnLSummaryCard kpis={kpis} />
      </div>

      {/* Agent Performance Section */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Agent Performance</h2>
        <AgentPerformanceCard kpis={kpis} />
      </div>

      {/* Pattern Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Pattern Performance</h2>
          <PatternHeatmap patterns={kpis.pattern_performance || []} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-4">Exit Analysis</h2>
          <ExitAnalysisCard kpis={kpis} />
        </div>
      </div>

      {/* Footer Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Data Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Total Trades</p>
              <p className="text-2xl font-bold">{kpis.trades?.total_trades || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Alerts</p>
              <p className="text-2xl font-bold">{kpis.sentinel?.total_alerts || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Entry Cycles</p>
              <p className="text-2xl font-bold">{kpis.atlas_entry?.total_cycles || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Trade Reviews</p>
              <p className="text-2xl font-bold">{kpis.atlas_trade?.total_trades_reviewed || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

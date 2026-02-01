'use client';

/**
 * Agent Performance Card
 * Displays Sentinel and Atlas agent performance metrics
 */

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import type { AllKPIs } from '@kit/trading-core';
import { BrainCircuitIcon, ShieldCheckIcon, ActivityIcon } from 'lucide-react';

interface AgentPerformanceCardProps {
  kpis: AllKPIs;
}

export function AgentPerformanceCard({ kpis }: AgentPerformanceCardProps) {
  const { sentinel, atlas_entry, atlas_trade, agent_costs } = kpis;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  };

  const totalAICost = (agent_costs?.total_cost_usd || 0) +
    (atlas_entry?.total_cost_usd || 0) +
    (atlas_trade?.total_cost_usd || 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Sentinel Agent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheckIcon className="h-5 w-5 text-blue-500" />
            Sentinel
            <Badge variant="outline" className="ml-auto">
              {sentinel?.alerts_today || 0} today
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Alerts</span>
              <span className="font-semibold">{sentinel?.total_alerts || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">This Week</span>
              <span className="font-semibold">{sentinel?.alerts_this_week || 0}</span>
            </div>
          </div>

          <div className="pt-3 border-t space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase">Decisions</h5>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Alert</p>
                <p className="text-lg font-semibold">{sentinel?.alert_decisions || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Wait</p>
                <p className="text-lg font-semibold">{sentinel?.no_alert_decisions || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Need Data</p>
                <p className="text-lg font-semibold">{sentinel?.need_data_decisions || 0}</p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase">Recommendations</h5>
            <div className="flex items-center justify-between">
              <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                APPROVE {sentinel?.approve_recommendations || 0}
              </Badge>
              <Badge variant="default" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                WAIT {sentinel?.wait_recommendations || 0}
              </Badge>
              <Badge variant="default" className="bg-red-100 text-red-800 border-red-200">
                BLOCK {sentinel?.block_recommendations || 0}
              </Badge>
            </div>
          </div>

          <div className="pt-3 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Conversion Rate</span>
              <span className="font-semibold">{sentinel?.conversion_rate.toFixed(1) || '0.0'}%</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-muted-foreground">Avg Confidence</span>
              <span className="font-semibold">{((sentinel?.avg_confidence || 0) * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="pt-3 border-t">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Cost</span>
              <span className="text-sm font-semibold">{formatCurrency(agent_costs?.sentinel_cost_usd || 0)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Atlas Entry Agent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BrainCircuitIcon className="h-5 w-5 text-purple-500" />
            Atlas Entry
            <Badge variant="outline" className="ml-auto">
              {atlas_entry?.cycles_today || 0} today
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Cycles</span>
              <span className="font-semibold">{atlas_entry?.total_cycles || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">This Week</span>
              <span className="font-semibold">{atlas_entry?.cycles_this_week || 0}</span>
            </div>
          </div>

          <div className="pt-3 border-t space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase">Entry Gatekeeping</h5>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-green-600">Approved</p>
                <p className="text-lg font-semibold">{atlas_entry?.total_approved || 0}</p>
              </div>
              <div>
                <p className="text-xs text-yellow-600">Wait</p>
                <p className="text-lg font-semibold">{atlas_entry?.total_wait || 0}</p>
              </div>
              <div>
                <p className="text-xs text-red-600">Blocked</p>
                <p className="text-lg font-semibold">{atlas_entry?.total_blocked || 0}</p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Approval Rate</span>
              <span className="font-semibold text-green-600">
                {atlas_entry?.approval_rate.toFixed(1) || '0.0'}%
              </span>
            </div>
          </div>

          <div className="pt-3 border-t space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase">Global Governor</h5>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Normal</p>
                <p className="text-sm font-semibold">
                  {(atlas_entry?.total_cycles || 0) - (atlas_entry?.caution_events || 0) - (atlas_entry?.emergency_events || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-yellow-600">Caution</p>
                <p className="text-sm font-semibold">{atlas_entry?.caution_events || 0}</p>
              </div>
              <div>
                <p className="text-xs text-red-600">Emergency</p>
                <p className="text-sm font-semibold">{atlas_entry?.emergency_events || 0}</p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Avg Latency</p>
              <p className="text-sm font-semibold">{atlas_entry?.avg_latency_ms || 0}ms</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cost</p>
              <p className="text-sm font-semibold">{formatCurrency(atlas_entry?.total_cost_usd || 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Atlas Trade Manager */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ActivityIcon className="h-5 w-5 text-orange-500" />
            Atlas Trade
            <Badge variant="outline" className="ml-auto">
              {atlas_trade?.cycles_today || 0} today
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Cycles</span>
              <span className="font-semibold">{atlas_trade?.total_cycles || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Trades Reviewed</span>
              <span className="font-semibold">{atlas_trade?.total_trades_reviewed || 0}</span>
            </div>
          </div>

          <div className="pt-3 border-t space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase">Trade Categories</h5>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-xs">HOLD</span>
                <span className="font-semibold text-sm">{atlas_trade?.hold_count || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-xs">DEFEND</span>
                <span className="font-semibold text-sm">{atlas_trade?.defend_count || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-xs">OPTIMIZE</span>
                <span className="font-semibold text-sm">{atlas_trade?.optimize_count || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted rounded">
                <span className="text-xs">EXIT</span>
                <span className="font-semibold text-sm">{atlas_trade?.exit_count || 0}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase">Actions</h5>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Proposed</span>
              <span className="font-semibold">{atlas_trade?.total_actions_proposed || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-600">Executed</span>
              <span className="font-semibold text-green-600">{atlas_trade?.actions_executed || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Failed</span>
              <span className="font-semibold">{atlas_trade?.actions_failed || 0}</span>
            </div>
          </div>

          <div className="pt-3 border-t grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Avg Latency</p>
              <p className="text-sm font-semibold">{atlas_trade?.avg_latency_ms || 0}ms</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cost</p>
              <p className="text-sm font-semibold">{formatCurrency(atlas_trade?.total_cost_usd || 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total AI Cost Summary */}
      <Card className="md:col-span-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total AI Cost</p>
              <p className="text-3xl font-bold">{formatCurrency(totalAICost)}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-xs text-muted-foreground">Total Tokens</p>
              <p className="text-lg font-semibold">
                {((agent_costs?.total_tokens_input || 0) +
                  (atlas_entry?.total_tokens_input || 0) +
                  (agent_costs?.total_tokens_output || 0) +
                  (atlas_entry?.total_tokens_output || 0)).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

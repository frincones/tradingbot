'use client';

/**
 * KPI Dashboard Component
 * Main dashboard showing all trading KPIs and metrics
 */

import { useTradingKPIs, usePatternAnalysis, useAgentROI } from '~/lib/hooks/use-trading-kpis';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { Skeleton } from '@kit/ui/skeleton';
import { ScrollArea } from '@kit/ui/scroll-area';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Target,
  AlertTriangle,
  Bot,
  BarChart3,
  PieChart,
  Clock,
  Zap,
  Shield,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@kit/ui/button';

// ============================================================================
// Utility Functions
// ============================================================================

function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

function StatCard({ title, value, subtitle, trend, icon, variant = 'default' }: StatCardProps) {
  const variantStyles = {
    default: 'bg-card',
    success: 'bg-green-500/10 border-green-500/20',
    danger: 'bg-red-500/10 border-red-500/20',
    warning: 'bg-yellow-500/10 border-yellow-500/20',
  };

  const textStyles = {
    default: 'text-foreground',
    success: 'text-green-500',
    danger: 'text-red-500',
    warning: 'text-yellow-500',
  };

  return (
    <Card className={`${variantStyles[variant]} border`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${textStyles[variant]}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
                {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                {subtitle}
              </p>
            )}
          </div>
          {icon && (
            <div className="text-muted-foreground opacity-50">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Progress Stat Component
// ============================================================================

interface ProgressStatProps {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

function ProgressStat({ label, value, max, suffix = '%', variant = 'default' }: ProgressStatProps) {
  const percent = max > 0 ? (value / max) * 100 : 0;

  const barColor = {
    default: 'bg-primary',
    success: 'bg-green-500',
    danger: 'bg-red-500',
    warning: 'bg-yellow-500',
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.toFixed(1)}{suffix}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor[variant]} transition-all duration-300`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Overview Section
// ============================================================================

function OverviewSection() {
  const { kpis, isLoading, lastUpdated, refetch } = useTradingKPIs();
  const { roi } = useAgentROI();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const pnl = kpis.pnl;
  const trades = kpis.trades;
  const totalPnL = (pnl?.total_realized_pnl_usd || 0) + (pnl?.total_unrealized_pnl_usd || 0);
  const pnlVariant = totalPnL >= 0 ? 'success' : 'danger';

  return (
    <div className="space-y-4">
      {/* Top Stats Row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Overview
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lastUpdated && (
            <span>Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <Button variant="ghost" size="sm" onClick={refetch} className="h-7 px-2">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Total P&L"
          value={formatCurrency(totalPnL)}
          subtitle={`${formatCurrency(pnl?.realized_pnl_today || 0)} today`}
          trend={totalPnL >= 0 ? 'up' : 'down'}
          icon={<DollarSign className="h-5 w-5" />}
          variant={pnlVariant}
        />
        <StatCard
          title="Win Rate"
          value={formatPercent(pnl?.win_rate || 0)}
          subtitle={`${pnl?.winning_trades || 0}W / ${pnl?.losing_trades || 0}L`}
          icon={<Target className="h-5 w-5" />}
          variant={(pnl?.win_rate || 0) >= 50 ? 'success' : 'warning'}
        />
        <StatCard
          title="Profit Factor"
          value={(pnl?.profit_factor || 0).toFixed(2)}
          subtitle="Gross P / Gross L"
          icon={<TrendingUp className="h-5 w-5" />}
          variant={(pnl?.profit_factor || 0) >= 1.5 ? 'success' : 'warning'}
        />
        <StatCard
          title="Open Trades"
          value={trades?.open_trades || 0}
          subtitle={`${formatCurrency(pnl?.total_unrealized_pnl_usd || 0)} unrealized`}
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Total Trades"
          value={trades?.total_trades || 0}
          subtitle={`${trades?.trades_today || 0} today`}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatCard
          title="Avg Win"
          value={formatCurrency(pnl?.avg_win_usd || 0)}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="success"
        />
        <StatCard
          title="Avg Loss"
          value={formatCurrency(Math.abs(pnl?.avg_loss_usd || 0))}
          icon={<TrendingDown className="h-5 w-5" />}
          variant="danger"
        />
        <StatCard
          title="Expectancy"
          value={formatCurrency(pnl?.expectancy_usd || 0)}
          subtitle="Per trade"
          icon={<Zap className="h-5 w-5" />}
          variant={(pnl?.expectancy_usd || 0) > 0 ? 'success' : 'danger'}
        />
      </div>

      {/* ROI Card */}
      <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">AI Agent ROI</p>
              <p className="text-2xl font-bold text-purple-400">
                {roi.roiPercentage >= 0 ? '+' : ''}{formatPercent(roi.roiPercentage)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ${roi.totalCost.toFixed(4)} cost / {formatCurrency(roi.totalPnL)} P&L
              </p>
            </div>
            <Bot className="h-8 w-8 text-purple-400 opacity-50" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Trade Stats Section
// ============================================================================

function TradeStatsSection() {
  const { kpis, isLoading } = useTradingKPIs();

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  const trades = kpis.trades;
  const pnl = kpis.pnl;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Trade Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Volume */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total Volume</p>
            <p className="text-lg font-semibold">{formatCurrency(trades?.total_volume_usd || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Position</p>
            <p className="text-lg font-semibold">{formatCurrency(trades?.avg_position_size_usd || 0)}</p>
          </div>
        </div>

        {/* Long/Short Distribution */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Long/Short Ratio</p>
          <div className="flex h-4 rounded-full overflow-hidden bg-muted">
            {trades?.long_count && trades?.short_count ? (
              <>
                <div
                  className="bg-green-500 transition-all"
                  style={{
                    width: `${(trades.long_count / (trades.long_count + trades.short_count)) * 100}%`,
                  }}
                />
                <div
                  className="bg-red-500 transition-all"
                  style={{
                    width: `${(trades.short_count / (trades.long_count + trades.short_count)) * 100}%`,
                  }}
                />
              </>
            ) : (
              <div className="bg-muted-foreground/20 w-full" />
            )}
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-green-500">{trades?.long_count || 0} Long</span>
            <span className="text-red-500">{trades?.short_count || 0} Short</span>
          </div>
        </div>

        {/* Hold Time */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-xs text-muted-foreground">Min Hold</p>
            <p className="text-sm font-medium">{(trades?.min_hold_time_minutes || 0).toFixed(0)}m</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-xs text-muted-foreground">Avg Hold</p>
            <p className="text-sm font-medium">{(trades?.avg_hold_time_minutes || 0).toFixed(0)}m</p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-xs text-muted-foreground">Max Hold</p>
            <p className="text-sm font-medium">{(trades?.max_hold_time_minutes || 0).toFixed(0)}m</p>
          </div>
        </div>

        {/* Exit Reasons */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Exit Reasons</p>
          <div className="space-y-2">
            <ProgressStat
              label="Take Profit"
              value={pnl?.tp_exits || 0}
              max={pnl?.closed_trades || 1}
              suffix=""
              variant="success"
            />
            <ProgressStat
              label="Stop Loss"
              value={pnl?.sl_exits || 0}
              max={pnl?.closed_trades || 1}
              suffix=""
              variant="danger"
            />
            <ProgressStat
              label="Manual"
              value={pnl?.manual_exits || 0}
              max={pnl?.closed_trades || 1}
              suffix=""
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Agent Performance Section
// ============================================================================

function AgentPerformanceSection() {
  const { kpis, isLoading } = useTradingKPIs();

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  const sentinel = kpis.sentinel;
  const atlasEntry = kpis.atlas_entry;
  const atlasTrade = kpis.atlas_trade;
  const costs = kpis.agent_costs;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Agent Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sentinel" className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-8">
            <TabsTrigger value="sentinel" className="text-xs">Sentinel</TabsTrigger>
            <TabsTrigger value="atlas-entry" className="text-xs">Entry</TabsTrigger>
            <TabsTrigger value="atlas-trade" className="text-xs">Trade</TabsTrigger>
          </TabsList>

          <TabsContent value="sentinel" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Total Alerts</p>
                <p className="text-lg font-semibold">{sentinel?.total_alerts || 0}</p>
              </div>
              <div className="p-2 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-lg font-semibold">{sentinel?.alerts_today || 0}</p>
              </div>
            </div>
            <ProgressStat
              label="Conversion Rate"
              value={sentinel?.conversion_rate || 0}
              max={100}
              variant={(sentinel?.conversion_rate || 0) >= 50 ? 'success' : 'warning'}
            />
            <ProgressStat
              label="Avg Confidence"
              value={(sentinel?.avg_confidence || 0) * 100}
              max={100}
              variant={(sentinel?.avg_confidence || 0) >= 0.7 ? 'success' : 'warning'}
            />
            <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
              <span>Cost: ${(costs?.sentinel_cost_usd || 0).toFixed(4)}</span>
              <span>Latency: {costs?.sentinel_avg_latency_ms || 0}ms</span>
            </div>
          </TabsContent>

          <TabsContent value="atlas-entry" className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 bg-green-500/10 rounded text-center">
                <p className="text-lg font-semibold text-green-500">{atlasEntry?.total_approved || 0}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
              <div className="p-2 bg-yellow-500/10 rounded text-center">
                <p className="text-lg font-semibold text-yellow-500">{atlasEntry?.total_wait || 0}</p>
                <p className="text-xs text-muted-foreground">Wait</p>
              </div>
              <div className="p-2 bg-red-500/10 rounded text-center">
                <p className="text-lg font-semibold text-red-500">{atlasEntry?.total_blocked || 0}</p>
                <p className="text-xs text-muted-foreground">Blocked</p>
              </div>
            </div>
            <ProgressStat
              label="Approval Rate"
              value={atlasEntry?.approval_rate || 0}
              max={100}
            />
            {(atlasEntry?.caution_events || 0) > 0 && (
              <div className="flex items-center gap-2 text-yellow-500 text-xs">
                <AlertTriangle className="h-3 w-3" />
                {atlasEntry?.caution_events} caution events
              </div>
            )}
            {(atlasEntry?.emergency_events || 0) > 0 && (
              <div className="flex items-center gap-2 text-red-500 text-xs">
                <AlertTriangle className="h-3 w-3" />
                {atlasEntry?.emergency_events} emergency events
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
              <span>Cycles: {atlasEntry?.total_cycles || 0}</span>
              <span>Cost: ${(atlasEntry?.total_cost_usd || 0).toFixed(4)}</span>
            </div>
          </TabsContent>

          <TabsContent value="atlas-trade" className="mt-4 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2 bg-blue-500/10 rounded text-center">
                <p className="text-sm font-semibold text-blue-500">{atlasTrade?.hold_count || 0}</p>
                <p className="text-xs text-muted-foreground">Hold</p>
              </div>
              <div className="p-2 bg-yellow-500/10 rounded text-center">
                <p className="text-sm font-semibold text-yellow-500">{atlasTrade?.defend_count || 0}</p>
                <p className="text-xs text-muted-foreground">Defend</p>
              </div>
              <div className="p-2 bg-green-500/10 rounded text-center">
                <p className="text-sm font-semibold text-green-500">{atlasTrade?.optimize_count || 0}</p>
                <p className="text-xs text-muted-foreground">Optimize</p>
              </div>
              <div className="p-2 bg-red-500/10 rounded text-center">
                <p className="text-sm font-semibold text-red-500">{atlasTrade?.exit_count || 0}</p>
                <p className="text-xs text-muted-foreground">Exit</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Actions Proposed</p>
                <p className="text-lg font-semibold">{atlasTrade?.total_actions_proposed || 0}</p>
              </div>
              <div className="p-2 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Executed</p>
                <p className="text-lg font-semibold">{atlasTrade?.actions_executed || 0}</p>
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
              <span>Reviews: {atlasTrade?.total_trades_reviewed || 0}</span>
              <span>Cost: ${(atlasTrade?.total_cost_usd || 0).toFixed(4)}</span>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Pattern Performance Section
// ============================================================================

function PatternPerformanceSection() {
  const { patterns, isLoading } = usePatternAnalysis();

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (patterns.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Pattern Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No pattern data available yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <PieChart className="h-4 w-4" />
          Pattern Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-3">
            {patterns.map((pattern) => (
              <div
                key={pattern.pattern_type}
                className="p-3 bg-muted/50 rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {pattern.pattern_type?.replace(/_/g, ' ') || 'Unknown'}
                  </span>
                  <Badge
                    variant={pattern.total_pnl >= 0 ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {formatCurrency(pattern.total_pnl)}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Trades</p>
                    <p className="font-medium">{pattern.total_trades}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Win Rate</p>
                    <p className="font-medium">{formatPercent(pattern.win_rate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg P&L</p>
                    <p className={`font-medium ${pattern.avg_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatCurrency(pattern.avg_pnl)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Confidence</p>
                    <p className="font-medium">{formatPercent(pattern.avg_confidence * 100)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Risk Overview Section
// ============================================================================

function RiskOverviewSection() {
  const { kpis, isLoading } = useTradingKPIs();

  if (isLoading) {
    return <Skeleton className="h-48" />;
  }

  const pnl = kpis.pnl;
  const atlasEntry = kpis.atlas_entry;

  // Calculate risk metrics
  const hasEmergency = (atlasEntry?.emergency_events || 0) > 0;
  const hasCaution = (atlasEntry?.caution_events || 0) > 0;
  const riskLevel = hasEmergency ? 'high' : hasCaution ? 'medium' : 'low';

  const riskColors = {
    low: 'text-green-500 bg-green-500/10 border-green-500/20',
    medium: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    high: 'text-red-500 bg-red-500/10 border-red-500/20',
  };

  return (
    <Card className={`border ${riskColors[riskLevel]}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Risk Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">Risk Level</span>
          <Badge
            variant={riskLevel === 'low' ? 'outline' : riskLevel === 'medium' ? 'secondary' : 'destructive'}
          >
            {riskLevel.toUpperCase()}
          </Badge>
        </div>

        <div className="space-y-2">
          <ProgressStat
            label="MFE Capture"
            value={
              pnl?.avg_mfe_usd && pnl?.avg_win_usd
                ? ((pnl.avg_win_usd / pnl.avg_mfe_usd) * 100)
                : 0
            }
            max={100}
            variant="success"
          />
          <ProgressStat
            label="MAE Control"
            value={
              pnl?.avg_mae_usd && pnl?.avg_loss_usd
                ? (100 - (Math.abs(pnl.avg_loss_usd) / Math.abs(pnl.avg_mae_usd)) * 100)
                : 100
            }
            max={100}
            variant={(pnl?.avg_mae_usd || 0) < (pnl?.avg_mfe_usd || 1) ? 'success' : 'warning'}
          />
        </div>

        <div className="pt-2 border-t">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Avg MFE</p>
              <p className="font-medium text-green-500">{formatCurrency(pnl?.avg_mfe_usd || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Avg MAE</p>
              <p className="font-medium text-red-500">{formatCurrency(Math.abs(pnl?.avg_mae_usd || 0))}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export function KPIDashboard() {
  return (
    <div className="space-y-6 p-4">
      {/* Overview Stats */}
      <OverviewSection />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TradeStatsSection />
            <AgentPerformanceSection />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <PatternPerformanceSection />
          <RiskOverviewSection />
        </div>
      </div>
    </div>
  );
}

export default KPIDashboard;

'use client';

/**
 * Alerts Feed - AI-generated trading alerts display
 * Shows alerts from LiquidationPattern Sentinel with expandable details
 */

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { ScrollArea } from '@kit/ui/scroll-area';
import {
  BellRing,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Brain,
  Target,
  Shield,
  DollarSign,
  Timer,
  PlayCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@kit/ui/utils';
import { AlertNotification } from './alert-notification';
import type { AgentAlert } from '@kit/trading-core';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  onAlertClick?: (alert: AgentAlert) => void;
  onNewAlert?: (alert: AgentAlert) => void;
  onSimulateTrade?: (alert: AgentAlert) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return `${diffSec}s`;
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  return date.toLocaleDateString();
}

function getRecommendationColor(rec: string): string {
  switch (rec) {
    case 'APPROVE':
      return 'text-green-500 bg-green-500/10 border-green-500/30';
    case 'WAIT':
      return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    case 'BLOCK':
      return 'text-red-500 bg-red-500/10 border-red-500/30';
    default:
      return 'text-muted-foreground';
  }
}

function getRecommendationIcon(rec: string) {
  switch (rec) {
    case 'APPROVE':
      return <CheckCircle className="h-3 w-3" />;
    case 'WAIT':
      return <Clock className="h-3 w-3" />;
    case 'BLOCK':
      return <XCircle className="h-3 w-3" />;
    default:
      return <AlertTriangle className="h-3 w-3" />;
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AlertsFeed({ onAlertClick, onNewAlert, onSimulateTrade }: Props) {
  const [alerts, setAlerts] = useState<AgentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());

  // Fetch initial alerts
  useEffect(() => {
    async function fetchAlerts() {
      try {
        const res = await fetch('/api/trading/alerts?status=new,viewed&limit=50');
        if (res.ok) {
          const data = await res.json();
          setAlerts(data.alerts || []);
          // Mark new alerts
          const newIds = new Set(
            (data.alerts || [])
              .filter((a: AgentAlert) => a.status === 'new')
              .map((a: AgentAlert) => a.id)
          );
          setNewAlertIds(newIds as Set<string>);
        }
      } catch (err) {
        console.error('Failed to fetch alerts:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAlerts();

    // Poll for new alerts every 10 seconds
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle new alert from realtime (called by parent)
  const handleNewAlert = useCallback(
    (alert: AgentAlert) => {
      setAlerts((prev) => {
        // Avoid duplicates
        if (prev.some((a) => a.id === alert.id)) return prev;
        return [alert, ...prev].slice(0, 50);
      });
      setNewAlertIds((prev) => new Set([...prev, alert.id]));
      onNewAlert?.(alert);

      // Show toast notification
      toast.custom(
        (id) => (
          <AlertNotification
            alert={alert}
            onDismiss={() => toast.dismiss(id)}
            onClick={() => {
              toast.dismiss(id);
              setExpandedId(alert.id);
              markAsViewed(alert.id);
            }}
          />
        ),
        {
          duration: 15000,
          position: 'bottom-right',
        }
      );
    },
    [onNewAlert]
  );

  // Mark alert as viewed
  const markAsViewed = async (alertId: string) => {
    try {
      await fetch(`/api/trading/alerts/${alertId}/view`, { method: 'POST' });
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: 'viewed' as const } : a))
      );
      setNewAlertIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    } catch (err) {
      console.error('Failed to mark alert as viewed:', err);
    }
  };

  // Dismiss alert
  const dismissAlert = async (alertId: string) => {
    try {
      await fetch(`/api/trading/alerts/${alertId}/dismiss`, { method: 'POST' });
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  // Toggle expand
  const toggleExpand = (alertId: string) => {
    setExpandedId((prev) => (prev === alertId ? null : alertId));
    if (newAlertIds.has(alertId)) {
      markAsViewed(alertId);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Empty state
  if (alerts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Brain className="h-6 w-6 mb-1 opacity-50" />
        <p className="text-[10px]">No hay alertas</p>
        <p className="text-[9px] mt-1">Sentinel está analizando el mercado...</p>
      </div>
    );
  }

  // Alerts list
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b shrink-0">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <BellRing className="h-3 w-3 text-primary" />
          <span>AI Alerts</span>
        </div>
        <div className="flex items-center gap-1">
          {newAlertIds.size > 0 && (
            <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 animate-pulse">
              {newAlertIds.size} new
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
            {alerts.length} total
          </Badge>
        </div>
      </div>

      {/* Alerts list */}
      <ScrollArea className="flex-1">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              'border-b px-2 py-1.5 cursor-pointer hover:bg-muted/30 transition-colors',
              newAlertIds.has(alert.id) && 'bg-primary/5 border-l-2 border-l-primary'
            )}
            onClick={() => toggleExpand(alert.id)}
          >
            {/* Alert header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {alert.setup === 'LONG' ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : alert.setup === 'SHORT' ? (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                )}
                <Badge
                  variant={alert.setup === 'LONG' ? 'default' : 'destructive'}
                  className="text-[8px] px-1 py-0 h-3"
                >
                  {alert.setup}
                </Badge>
                <span className="text-[11px] font-semibold">{alert.symbol}</span>
                <Badge
                  className={cn(
                    'text-[8px] px-1 py-0 h-3 flex items-center gap-0.5',
                    getRecommendationColor(alert.recommendation)
                  )}
                >
                  {getRecommendationIcon(alert.recommendation)}
                  {alert.recommendation}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground font-mono">
                  {(alert.confidence * 100).toFixed(0)}%
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {formatTimeAgo(alert.ts)}
                </span>
                {expandedId === alert.id ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </div>
            </div>

            {/* Thesis title */}
            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {alert.thesis_json?.title || 'Analyzing pattern...'}
            </div>

            {/* Expanded content */}
            {expandedId === alert.id && (
              <div className="mt-2 space-y-2 text-[10px]">
                {/* Pattern info */}
                {alert.pattern_json && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">
                      {alert.pattern_json.type}
                    </Badge>
                    {alert.pattern_json.flush_score && (
                      <span className="text-muted-foreground">
                        Flush: <span className="font-mono">{alert.pattern_json.flush_score}</span>
                      </span>
                    )}
                    {alert.pattern_json.burst_score && (
                      <span className="text-muted-foreground">
                        Burst: <span className="font-mono">{alert.pattern_json.burst_score}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Thesis reasoning */}
                {alert.thesis_json?.reasoning && (
                  <div>
                    <span className="text-muted-foreground">Tesis:</span>
                    <p className="mt-0.5">{alert.thesis_json.reasoning}</p>
                  </div>
                )}

                {/* Execution candidate - Expanded */}
                {alert.execution_json && (
                  <div className="space-y-1.5 p-1.5 bg-muted/30 rounded text-[9px]">
                    {/* Entry Zone */}
                    <div className="flex items-center gap-2">
                      <Target className="h-3 w-3 text-blue-400" />
                      <span className="text-muted-foreground">Entry:</span>
                      <span className="font-mono">
                        ${alert.execution_json.entry_zone.min.toLocaleString()}-
                        {alert.execution_json.entry_zone.max.toLocaleString()}
                      </span>
                      {alert.execution_json.entry_zone.ideal && (
                        <span className="text-muted-foreground">
                          (ideal: ${alert.execution_json.entry_zone.ideal.toLocaleString()})
                        </span>
                      )}
                    </div>

                    {/* Stop Loss */}
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-red-400" />
                      <span className="text-muted-foreground">Stop Loss:</span>
                      <span className="font-mono text-red-500">
                        ${typeof alert.execution_json.stop_loss === 'object'
                          ? alert.execution_json.stop_loss.price.toLocaleString()
                          : alert.execution_json.stop_loss.toLocaleString()}
                      </span>
                      {typeof alert.execution_json.stop_loss === 'object' && (
                        <span className="text-red-400">
                          (-{alert.execution_json.stop_loss.percentage.toFixed(1)}%)
                        </span>
                      )}
                    </div>

                    {/* Take Profit Targets */}
                    <div className="flex items-start gap-2">
                      <DollarSign className="h-3 w-3 text-green-400 mt-0.5" />
                      <div className="flex-1">
                        <span className="text-muted-foreground">Take Profit:</span>
                        {alert.execution_json.take_profit_targets && alert.execution_json.take_profit_targets.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {alert.execution_json.take_profit_targets.map((tp, i) => (
                              <Badge key={i} variant="outline" className="text-[8px] text-green-500 border-green-500/30">
                                TP{i + 1}: ${tp.price.toLocaleString()} (+{tp.percentage.toFixed(1)}%) @ {tp.size_pct}%
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="font-mono text-green-500 ml-1">
                            ${alert.execution_json.take_profit.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Risk Metrics */}
                    <div className="flex items-center gap-4 pt-1 border-t border-border/50">
                      <div>
                        <span className="text-muted-foreground">R:R:</span>
                        <span className="font-mono ml-1 text-primary">
                          {alert.execution_json.risk_reward_ratio.toFixed(1)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Size:</span>
                        <span className="font-mono ml-1">
                          {alert.execution_json.position_size_pct}%
                        </span>
                      </div>
                      {alert.execution_json.timing && (
                        <div className="flex items-center gap-1">
                          <Timer className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="font-mono">{alert.execution_json.timing.expected_duration}</span>
                        </div>
                      )}
                      {alert.execution_json.expected_duration && !alert.execution_json.timing && (
                        <div className="flex items-center gap-1">
                          <Timer className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono">{alert.execution_json.expected_duration}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Risk notes */}
                {alert.risk_notes && alert.risk_notes.length > 0 && (
                  <div className="text-yellow-500/80 text-[9px]">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    {alert.risk_notes.join(' • ')}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissAlert(alert.id);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Dismiss
                  </Button>
                  {alert.recommendation === 'APPROVE' && alert.execution_json && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSimulateTrade?.(alert);
                        }}
                      >
                        <PlayCircle className="h-3 w-3 mr-1" />
                        Simulate
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAlertClick?.(alert);
                        }}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Review Trade
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

// Export for use in other components
export { AlertNotification };
